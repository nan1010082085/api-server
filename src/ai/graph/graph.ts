/**
 * AI Agent Graph — StateGraph assembly.
 *
 * Graph structure:
 *   START -> router -> (agentSelector | taskChain) -> ... -> END
 *
 * Nodes:
 * - router: routing decisions (explicit mode, task chain, or LLM analysis)
 * - taskChain: task chain progression management
 * - pluginExpert: 唯一专家执行节点（Registry + 领域上下文）
 * - allTools: tool execution
 * - afterTools: post-tool collaboration extraction
 * - summarizer: multi-step result summary
 */

import { StateGraph, END, START, BaseCheckpointSaver } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages'
import { AgentStateAnnotation } from './state.js'
import type { RequirementAnalysis as StateRequirementAnalysis, TaskPlan, TaskPlanStep as StateTaskPlanStep } from './state.js'
import { pluginExpertAgentNode } from './pluginExpertAgent.js'
import { sessionForAgent } from './resolveGraphExpert.js'
import { getAllToolsSync, getToolSync } from '../tools/registry.js'
import { checkpointer } from './checkpointer.js'
import { getLLM } from '../services/llmCache.js'
import { getModelForTask, resolveUserModel } from './agentBase.js'
import { extractAgentContext } from './contextCarrier.js'
import { logger } from '../../utils/logger.js'
import { routeAfterRequirementAnalyzer } from './requirementAnalyzer.js'
import { requirementConfirmNode } from './requirementConfirm.js'
import { routeAfterTaskPlanner } from './taskPlanner.js'
import { resolveIntent, analyzeRequirement, planTasks, generateSummaryText, routeCollaboration } from '../runtime/index.js'
import type { RequirementAnalysis as RuntimeRequirementAnalysis } from '../runtime/index.js'
import { getPluginRegistry } from '../plugins/index.js'

// ────────────────────────────────────────────
// Tool nodes（带错误兜底）
// ────────────────────────────────────────────

const allToolNode = new ToolNode(getAllToolsSync())

/**
 * 从 state 消息中提取最近一条 AIMessage 的 tool_calls 信息。
 * 用于工具执行异常时记录失败的 tool 名称和输入参数。
 */
function extractPendingToolCalls(state: typeof AgentStateAnnotation.State): Array<{ id: string; name: string; args: Record<string, unknown> }> {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i]
    if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
      return msg.tool_calls.map((tc) => ({
        id: tc.id ?? 'unknown',
        name: tc.name,
        args: tc.args as Record<string, unknown>,
      }))
    }
  }
  return []
}

/**
 * 包装 ToolNode，捕获未预期的异常（如 MongoDB 断连），
 * 返回友好的 ToolMessage 而不是中断图执行。
 *
 * 对每个失败的 tool_call 生成独立的 ToolMessage，
 * 并通过 `ai:thinker:error` 结构化日志记录失败详情。
 */
async function allToolNodeWithErrorHandling(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  try {
    return await allToolNode.invoke(state)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const pendingTools = extractPendingToolCalls(state)

    // 为每个待执行的 tool_call 生成错误 ToolMessage
    const errorMessages: ToolMessage[] = []

    if (pendingTools.length > 0) {
      for (const tc of pendingTools) {
        // 结构化日志：ai:thinker:error
        logger.error({
          msg: 'ai:thinker:error',
          toolName: tc.name,
          toolInput: tc.args,
          error: errorMessage,
          conversationId: state.session.conversationId,
          agent: state.session.currentAgent,
        })

        errorMessages.push(new ToolMessage({
          content: JSON.stringify({
            success: false,
            error: `工具 ${tc.name} 执行异常: ${errorMessage}`,
            recoverable: true,
          }),
          tool_call_id: tc.id,
          name: tc.name,
        }))
      }
    } else {
      // 无法确定具体 tool，记录通用错误
      logger.error({
        msg: 'ai:thinker:error',
        toolName: 'unknown',
        toolInput: {},
        error: errorMessage,
        conversationId: state.session.conversationId,
        agent: state.session.currentAgent,
      })

      errorMessages.push(new ToolMessage({
        content: JSON.stringify({ success: false, error: '工具执行异常，请重试', recoverable: true }),
        tool_call_id: 'error',
        name: 'system_error',
      }))
    }

    return { messages: errorMessages }
  }
}

// ────────────────────────────────────────────
// Router node — routing decisions only
// ────────────────────────────────────────────

async function routerNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  // 全局节点执行计数与死循环防护
  const nextCount = state.session.nodeExecutionCount + 1
  if (nextCount >= state.session.maxNodeExecutions) {
    console.error(`[router] 全局节点执行上限 ${state.session.maxNodeExecutions}，强制结束`)
    return {
      session: { ...state.session, nodeExecutionCount: nextCount },
      error: { message: '执行超限，已自动停止', recoverable: false },
    }
  }

  // 任务链进行中（graph-specific state management）
  if (state.task.chain.length > 0) {
    console.log(`[router] 任务链进行中 step=${state.task.currentStepIndex}/${state.task.chain.length}, 路由到 taskChain`)
    return { session: { ...state.session, nodeExecutionCount: nextCount } }
  }

  // 通过 runtime 纯函数解析意图
  const lastContent = state.messages[state.messages.length - 1]?.content
  const userMessage = typeof lastContent === 'string' ? lastContent : ''

  const registry = getPluginRegistry()
  const intent = await resolveIntent(
    { message: userMessage, contextSource: state.context.source },
    { registry },
  )

  console.log(`[router] ${intent.routeReason}`)

  // 多意图链（agent descriptions 可通过 DB 配置 system_config_agent_descriptions）
  if (intent.chainPreview && intent.chainPreview.length > 1) {
    const { getAgentDescriptions } = await import('../services/systemConfig.js')
    const AGENT_DESCRIPTIONS = await getAgentDescriptions()
    const chain = intent.chainPreview.map((agent) => ({
      agent: agent as 'editor' | 'flow' | 'page',
      description: AGENT_DESCRIPTIONS[agent] ?? `生成 ${agent}`,
      status: 'pending' as const,
    }))
    return {
      session: sessionForAgent(state.session, intent.legacyAgentKey, intent.expertId),
      task: { ...state.task, type: 'generate_simple', chain, currentStepIndex: 0 },
      tools: { ...state.tools, needsTool: true },
    }
  }

  // 通用问候 / 兜底
  if (intent.routeReason === 'general greeting' || intent.routeReason.startsWith('fallback')) {
    return {
      session: sessionForAgent(state.session, 'general'),
      task: { ...state.task, type: 'general' },
      tools: { ...state.tools, needsTool: false },
    }
  }

  // 专家匹配（显式模式 / 插件中心）
  return {
    session: sessionForAgent(
      { ...state.session, nodeExecutionCount: nextCount },
      intent.legacyAgentKey,
      intent.expertId,
    ),
    task: {
      ...state.task,
      type: 'generate_simple',
      chain: [{
        agent: intent.legacyAgentKey as 'editor' | 'flow' | 'page',
        description: intent.routeReason,
        status: 'pending' as const,
      }],
      currentStepIndex: 0,
    },
    tools: { ...state.tools, needsTool: true },
  }
}

// ────────────────────────────────────────────
// Task chain node — chain progression management
// ────────────────────────────────────────────

async function taskChainNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const currentIndex = state.task.currentStepIndex

  if (state.interaction.collaborationRequest) {
    const { targetAgent, description } = state.interaction.collaborationRequest
    const currentAgent = state.session.currentAgent

    // 协作去重：防止 A→B→A→B 无限循环
    const reverseExists = state.interaction.collaborationHistory.some(
      (h) => h.from === targetAgent && h.to === currentAgent,
    )
    if (reverseExists) {
      console.warn(`[taskChain] 检测到协作循环 ${currentAgent}↔${targetAgent}，跳过`)
      return { interaction: { ...state.interaction, collaborationRequest: null } }
    }

    // Extract context from the current agent before collaboration handoff
    const agentContext = extractAgentContext(state)
    const updatedChain = [...state.task.chain]
    if (agentContext && updatedChain[currentIndex]) {
      updatedChain[currentIndex] = {
        ...updatedChain[currentIndex],
        status: 'done' as const,
        context: agentContext as unknown as Record<string, unknown>,
      }
    }

    const newStep = {
      agent: targetAgent as 'editor' | 'flow' | 'page',
      description: `协作：${description}`,
      status: 'pending' as const,
      context: state.interaction.collaborationRequest.context,
    }

    const finalChain = [
      ...updatedChain.slice(0, currentIndex + 1),
      newStep,
      ...updatedChain.slice(currentIndex + 1),
    ]

    console.log(`[taskChain] 协作请求: 插入 ${targetAgent} 步骤到位置 ${currentIndex + 1}`)

    return {
      session: sessionForAgent(state.session, targetAgent as 'editor' | 'flow' | 'page'),
      task: { ...state.task, type: 'generate_simple', chain: finalChain, currentStepIndex: currentIndex + 1 },
      tools: { ...state.tools, needsTool: true },
      interaction: {
        ...state.interaction,
        collaborationRequest: null,
        collaborationHistory: [
          ...state.interaction.collaborationHistory,
          { from: currentAgent, to: targetAgent, timestamp: Date.now() },
        ],
      },
    }
  }

  if (currentIndex >= state.task.chain.length) {
    console.log(`[taskChain] 所有步骤完成, 路由到 summarizer`)
    return {
      session: sessionForAgent(state.session, 'general'),
      task: { ...state.task, type: 'summarize' },
      tools: { ...state.tools, needsTool: false },
    }
  }

  // Extract context from the previous step (if any) and carry it forward
  const updatedChain = state.task.chain.map((step, i) => {
    if (i === currentIndex) return { ...step, status: 'running' as const }
    if (i < currentIndex) return { ...step, status: 'done' as const }
    return step
  })

  // If transitioning from a previous step, extract its context
  if (currentIndex > 0) {
    const prevStep = updatedChain[currentIndex - 1]
    if (!prevStep.context) {
      const agentContext = extractAgentContext(state)
      if (agentContext) {
        updatedChain[currentIndex - 1] = {
          ...prevStep,
          context: agentContext as unknown as Record<string, unknown>,
        }
        console.log(`[taskChain] Context extracted for step ${currentIndex - 1}: ${agentContext.summary}`)
      }
    }
  }

  // Build context injection for the current step from all previous steps
  const currentStep = state.task.chain[currentIndex]
  const upstreamContexts = updatedChain
    .slice(0, currentIndex)
    .filter((s) => s.context)
    .map((s) => s.context)

  let stepContext = currentStep.context
  if (upstreamContexts.length > 0 && !stepContext) {
    // Merge upstream contexts into the current step
    stepContext = {
      upstream: upstreamContexts,
    } as unknown as Record<string, unknown>
  }

  console.log(`[taskChain] 执行步骤 ${currentIndex}: ${currentStep.agent} - ${currentStep.description}`)

  return {
    session: sessionForAgent(state.session, currentStep.agent as 'editor' | 'flow' | 'page'),
    task: { ...state.task, type: 'generate_simple', chain: updatedChain, currentStepIndex: currentIndex },
    tools: { ...state.tools, needsTool: true },
  }
}

// ────────────────────────────────────────────
// Summarizer node
// ────────────────────────────────────────────

async function summarizerNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const lastUserMessage = [...state.messages]
    .reverse()
    .find((m) => m.constructor.name === 'HumanMessage')

  const userContent = lastUserMessage
    ? (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage.content))
    : '你好'

  const steps = state.task.chain
    .filter((step) => step.status === 'done')
    .map((step) => ({
      description: `${step.agent} 专家：${step.description}`,
      output: '',
      status: step.status,
    }))

  const model = resolveUserModel(state.interaction.preferences, getModelForTask('analyze'))

  const content = await generateSummaryText(
    { steps, userMessage: userContent, model },
    {
      getLLM: async (opts) => {
        const llm = await getLLM(opts)
        return { stream: (msgs: unknown[]) => llm.stream(msgs as any) as any }
      },
    },
  )

  return {
    messages: [new AIMessage({ content })],
    session: sessionForAgent(state.session, 'general'),
  }
}

// ────────────────────────────────────────────
// Requirement Analyzer node — runtime wrapper
// ────────────────────────────────────────────

function runtimeToStateAnalysis(rt: RuntimeRequirementAnalysis): StateRequirementAnalysis {
  const entities: StateRequirementAnalysis['entities'] = {}
  for (const e of rt.entities) {
    const key = e.type === 'form' ? 'forms' : e.type === 'flow' ? 'flows' : 'pages'
    if (!entities[key]) entities[key] = []
    entities[key].push({ name: e.value })
  }

  return {
    intent: rt.intent as StateRequirementAnalysis['intent'],
    type: rt.recommendedExperts.length > 1 ? 'mixed'
      : rt.recommendedExperts[0] === 'editor' ? 'form'
        : rt.recommendedExperts[0] === 'flow' ? 'flow'
          : rt.recommendedExperts[0] === 'page' ? 'page'
            : 'general',
    complexity: rt.completeness >= 80 ? 'simple' : rt.completeness >= 60 ? 'medium' : 'complex',
    entities,
    completeness: { score: rt.completeness, missing: [], assumptions: [] },
    confirmQuestions: rt.confirmQuestions.map((q, i) => ({
      id: `q${i + 1}`,
      question: q,
      required: true,
    })),
    suggestedChain: rt.recommendedExperts.map((expert, i) => ({
      agent: expert as 'editor' | 'flow' | 'page',
      description: `由 ${expert} 专家处理`,
      priority: i + 1,
      dependencies: [],
    })),
  }
}

async function requirementAnalyzerNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const lastHumanMessage = [...state.messages]
    .reverse()
    .find((m) => m.constructor.name === 'HumanMessage')
  const userContent = lastHumanMessage
    ? (typeof lastHumanMessage.content === 'string' ? lastHumanMessage.content : JSON.stringify(lastHumanMessage.content))
    : ''

  if (!userContent) {
    logger.warn({ msg: '[requirementAnalyzer] No user content found' })
    return {
      requirement: { analysis: null, userConfirmations: {}, needsConfirmation: false, status: 'pending' },
    }
  }

  const model = resolveUserModel(state.interaction.preferences, getModelForTask('analyze'))

  const result = await analyzeRequirement(
    {
      message: userContent,
      contextSource: state.context.source,
      model,
    },
    {
      getLLM: async (opts) => {
        const llm = await getLLM(opts)
        return {
          invoke: async (msgs: unknown[]) => {
            const result = await llm.invoke(msgs as any)
            return {
              content: typeof result.content === 'string' ? result.content : '',
              tool_calls: result.tool_calls as Array<{ id: string; name: string; args: Record<string, unknown> }> | undefined,
            }
          },
        }
      },
      ragSearch: async (query: string, limit?: number) => {
        const { getRagToolName } = await import('../services/systemConfig.js')
        const ragToolName = await getRagToolName()
        const ragTool = getToolSync(ragToolName) as unknown as { invoke: (args: Record<string, unknown>) => Promise<string> } | undefined
        if (!ragTool) return ''
        const res = await ragTool.invoke({ query, limit: limit ?? 5 })
        return typeof res === 'string' ? res : ''
      },
      callTool: async (name: string, args: Record<string, unknown>) => {
        const tool = getToolSync(name) as unknown as { invoke: (args: Record<string, unknown>) => Promise<string> } | undefined
        if (!tool) throw new Error(`Tool not found: ${name}`)
        const res = await tool.invoke(args)
        return typeof res === 'string' ? res : JSON.stringify(res)
      },
    },
  )

  if (!result) {
    logger.warn({ msg: '[requirementAnalyzer] Analysis returned null' })
    return {
      requirement: { analysis: null, userConfirmations: {}, needsConfirmation: false, status: 'pending' },
    }
  }

  const analysis = runtimeToStateAnalysis(result)
  const needsConfirmation = analysis.complexity !== 'simple' || analysis.completeness.score < 80

  logger.info({
    msg: '[requirementAnalyzer] Analysis complete',
    intent: analysis.intent,
    type: analysis.type,
    complexity: analysis.complexity,
    completeness: analysis.completeness.score,
    needsConfirmation,
  })

  return {
    requirement: { analysis, userConfirmations: {}, needsConfirmation, status: 'analyzed' },
  }
}

// ────────────────────────────────────────────
// Task Planner node — runtime wrapper
// ────────────────────────────────────────────

async function taskPlannerNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const { requirement, context } = state

  logger.info({
    msg: '[taskPlanner] Planning tasks',
    hasAnalysis: !!requirement.analysis,
    source: context.source,
  })

  // 显式模式：简单计划
  if (context.source !== 'standalone') {
    const agent = context.source
    const plan: TaskPlan = {
      chain: [{
        id: 'step-1',
        agent,
        description: `生成${agent === 'editor' ? '表单' : agent === 'flow' ? '流程' : '页面'}`,
        inputs: {},
        outputs: {},
        dependencies: [],
        priority: 1,
        status: 'pending',
      }],
      strategy: { mode: 'sequential', retryPolicy: 'simple', timeout: 300000 },
      contextFlow: [],
    }
    return {
      taskPlan: { plan, currentStepId: 'step-1', executionLog: [] },
      task: {
        ...state.task,
        type: 'planned',
        chain: plan.chain.map((s) => ({ agent: s.agent, description: s.description, status: 'pending' as const })),
        currentStepIndex: 0,
      },
    }
  }

  const model = resolveUserModel(state.interaction.preferences, getModelForTask('analyze'))
  const lastHumanMessage = [...state.messages].reverse().find((m) => m.constructor.name === 'HumanMessage')
  const userContent = lastHumanMessage
    ? (typeof lastHumanMessage.content === 'string' ? lastHumanMessage.content : JSON.stringify(lastHumanMessage.content))
    : ''

  const result = await planTasks(
    {
      message: userContent,
      requirementAnalysis: requirement.analysis ? {
        intent: requirement.analysis.intent,
        type: requirement.analysis.type,
        complexity: requirement.analysis.complexity,
        entities: requirement.analysis.entities,
        suggestedChain: requirement.analysis.suggestedChain,
      } : undefined,
      model,
    },
    {
      getLLM: async (opts) => {
        const llm = await getLLM(opts)
        return { stream: (msgs: unknown[]) => llm.stream(msgs as any) as any }
      },
    },
  )

  const chain: StateTaskPlanStep[] = result.chain.map((step, i) => ({
    id: step.id || `step-${i + 1}`,
    agent: (step.legacyAgentKey ?? 'editor') as 'editor' | 'flow' | 'page',
    description: step.description,
    inputs: {},
    outputs: {},
    dependencies: [],
    priority: i + 1,
    status: 'pending' as const,
  }))

  const plan: TaskPlan = {
    chain,
    strategy: { mode: (result.strategy as TaskPlan['strategy']['mode']) ?? 'sequential', retryPolicy: 'simple', timeout: 300000 },
    contextFlow: [],
  }

  logger.info({
    msg: '[taskPlanner] Plan generated',
    steps: chain.length,
    strategy: result.strategy,
  })

  return {
    taskPlan: { plan, currentStepId: chain[0]?.id ?? null, executionLog: [] },
    task: {
      ...state.task,
      type: 'planned',
      chain: chain.map((s) => ({ agent: s.agent, description: s.description, status: 'pending' as const })),
      currentStepIndex: 0,
    },
  }
}

// ────────────────────────────────────────────
// Conditional edge functions
// ────────────────────────────────────────────

export function routeAfterTaskChain(
  state: typeof AgentStateAnnotation.State,
): string {
  console.log(`[routeAfterTaskChain] currentAgent=${state.session.currentAgent}, taskType=${state.task.type}`)

  if (state.task.type === 'summarize') {
    console.log(`[routeAfterTaskChain] -> summarizer (任务链完成)`)
    return 'summarizer'
  }

  console.log(`[routeAfterTaskChain] -> pluginExpert (agent=${state.session.currentAgent})`)
  return 'pluginExpert'
}

export function afterAgent(
  state: typeof AgentStateAnnotation.State,
): string {
  const lastMessage = state.messages[state.messages.length - 1]
  // 支持 AIMessage 和 AIMessageChunk（invoke 可能返回 Chunk）
  const isAiMessage = lastMessage instanceof AIMessage || lastMessage instanceof AIMessageChunk
  const hasToolCalls = isAiMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0

  console.log(`[afterAgent] source=${state.context.source}, hasToolCalls=${hasToolCalls}, taskChain=${state.task.chain.length}, step=${state.task.currentStepIndex}, messages=${state.messages.length}`)

  const MAX_TOOL_ITERATIONS = 3
  if (hasToolCalls) {
    if (state.tools.toolIterationCount >= MAX_TOOL_ITERATIONS) {
      console.warn(`[afterAgent] 工具迭代上限 ${MAX_TOOL_ITERATIONS}，路由到 summarizer`)
      return 'summarizer'
    }
    console.log(`[afterAgent] -> allTools (${lastMessage.tool_calls!.length} tool_calls)`)
    return 'allTools'
  }

  if (state.context.source === 'standalone' && state.task.chain.length > 0) {
    const nextIndex = state.task.currentStepIndex + 1

    if (nextIndex < state.task.chain.length) {
      console.log(`[afterAgent] -> taskChain (继续任务链 step ${nextIndex}/${state.task.chain.length})`)
      return 'taskChain'
    }

    console.log(`[afterAgent] -> summarizer (任务链完成)`)
    return 'summarizer'
  }

  console.log(`[afterAgent] -> END (显式模式, 无 tool_calls)`)
  return END
}

async function afterToolsNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  // 全局节点执行计数递增（工具循环每次 +1）
  const nextNodeCount = state.session.nodeExecutionCount + 1
  if (nextNodeCount >= state.session.maxNodeExecutions) {
    console.warn(`[afterTools] 全局节点执行上限 ${state.session.maxNodeExecutions}，强制结束`)
    return {
      session: { ...state.session, nodeExecutionCount: nextNodeCount },
      error: { message: '执行超限，已自动停止', recoverable: false },
    }
  }

  // 从消息中提取工具调用，供 routeCollaboration 使用
  const toolResults: Array<{ toolName: string; output: any }> = []
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i]
    if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        toolResults.push({ toolName: tc.name, output: tc.args })
      }
      break
    }
  }

  // 构建 routeCollaboration 所需的 taskChain 和 collaborationHistory
  const taskChain = state.task.chain.length > 0
    ? {
        steps: state.task.chain.map((step, i) => ({
          id: String(i),
          description: step.description,
          expertId: step.agent,
          status: step.status,
        })),
        currentStepIndex: state.task.currentStepIndex,
      }
    : undefined

  const collaborationHistory = state.interaction.collaborationHistory.map((h) => ({
    fromExpertId: h.from,
    toExpertId: h.to,
    reason: '',
    timestamp: new Date(h.timestamp),
  }))

  // 通过 runtime 纯函数检测协作请求
  const collabResult = routeCollaboration({
    toolResults,
    currentExpertId: state.session.currentExpertId ?? state.session.currentAgent,
    taskChain,
    collaborationHistory,
  })

  // 检测到有效协作请求
  if (collabResult.next === 'expert' && collabResult.collaborationRequest) {
    const { targetExpert, reason, context } = collabResult.collaborationRequest

    // Extract context from the current agent before collaboration handoff
    const agentContext = extractAgentContext(state)
    const updatedChain = [...state.task.chain]
    if (agentContext && updatedChain[state.task.currentStepIndex]) {
      updatedChain[state.task.currentStepIndex] = {
        ...updatedChain[state.task.currentStepIndex],
        context: agentContext as unknown as Record<string, unknown>,
      }
    }

    return {
      session: { ...state.session, nodeExecutionCount: nextNodeCount },
      tools: { ...state.tools, toolIterationCount: state.tools.toolIterationCount + 1 },
      task: { ...state.task, chain: updatedChain },
      interaction: {
        ...state.interaction,
        collaborationRequest: {
          targetAgent: targetExpert as 'editor' | 'flow' | 'page',
          description: reason,
          context: context as Record<string, unknown> | undefined,
          conversationId: state.session.conversationId,
        },
      },
    }
  }

  // 无协作请求：提取当前步骤上下文
  const agentContext = extractAgentContext(state)
  const updatedChain = [...state.task.chain]
  if (agentContext && updatedChain[state.task.currentStepIndex]) {
    updatedChain[state.task.currentStepIndex] = {
      ...updatedChain[state.task.currentStepIndex],
      context: agentContext as unknown as Record<string, unknown>,
    }
    console.log(`[afterTools] Context extracted for step ${state.task.currentStepIndex}: ${agentContext.summary}`)
  }

  return {
    session: { ...state.session, nodeExecutionCount: nextNodeCount },
    tools: { ...state.tools, toolIterationCount: state.tools.toolIterationCount + 1 },
    task: updatedChain.length > 0 ? { ...state.task, chain: updatedChain } : state.task,
  }
}

/**
 * 协作路由节点 — 与前端设计器 collaboration-router 对齐。
 *
 * 三路输出：
 * - continue: 协作循环，回到 pluginExpert 继续当前步骤
 * - nextStep: 任务链推进，回到 taskChain 执行下一步
 * - summarize: 任务完成，路由到 summarizer 生成摘要
 */
async function collaborationRouterNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  // 节点本身不做状态修改，仅用于路由决策
  return {}
}

/**
 * collaborationRouter 之后的三路路由。
 *
 * 对应前端设计器 collaboration-router 的三个 sourceHandle：
 * - continue → pluginExpert（协作循环）
 * - nextStep → taskChain（下一任务）
 * - summarize → summarizer（摘要输出）
 */
export function routeAfterCollaborationRouter(
  state: typeof AgentStateAnnotation.State,
): string {
  console.log(`[collaborationRouter] source=${state.context.source}, taskChain=${state.task.chain.length}, step=${state.task.currentStepIndex}, collaboration=${!!state.interaction.collaborationRequest}`)

  // 协作请求：回到 pluginExpert 继续协作（continue 路径）
  if (state.interaction.collaborationRequest) {
    console.log(`[collaborationRouter] -> pluginExpert (continue 协作)`)
    return 'pluginExpert'
  }

  // 任务链进行中：推进到下一步（nextStep 路径）
  if (state.context.source === 'standalone' && state.task.chain.length > 0) {
    const nextIndex = state.task.currentStepIndex + 1

    if (nextIndex < state.task.chain.length) {
      console.log(`[collaborationRouter] -> taskChain (nextStep ${nextIndex}/${state.task.chain.length})`)
      return 'taskChain'
    }

    console.log(`[collaborationRouter] -> summarizer (任务链完成)`)
    return 'summarizer'
  }

  // 单步完成：回到 pluginExpert 处理后续（continue 路径）
  console.log(`[collaborationRouter] -> pluginExpert (continue 单步后续)`)
  return 'pluginExpert'
}

/** @deprecated Use routeAfterCollaborationRouter — same logic, renamed for frontend alignment */
export const afterToolsRoute = routeAfterCollaborationRouter

// ────────────────────────────────────────────
// Build and compile the graph
// ────────────────────────────────────────────

// v2 架构配置
const V2_CONFIG = {
  enableTaskPlanner: process.env.AI_ENABLE_TASK_PLANNER !== 'false',
}

const builder = new StateGraph(AgentStateAnnotation)
  .addNode('router', routerNode)
  .addNode('taskChain', taskChainNode)
  .addNode('pluginExpert', pluginExpertAgentNode)
  .addNode('allTools', allToolNodeWithErrorHandling)
  .addNode('afterTools', afterToolsNode)
  .addNode('collaborationRouter', collaborationRouterNode)
  .addNode('summarizer', summarizerNode)

  // v2 新增节点
  .addNode('requirementAnalyzer', requirementAnalyzerNode)
  .addNode('requirementConfirm', requirementConfirmNode)
  .addNode('taskPlanner', taskPlannerNode)

  // 边的连接
  .addEdge(START, 'router')

  // router 之后：统一走需求分析管线
  .addEdge('router', 'requirementAnalyzer')

  // requirementAnalyzer 之后
  .addConditionalEdges('requirementAnalyzer', routeAfterRequirementAnalyzer)
  .addEdge('requirementConfirm', 'taskPlanner')

  // taskPlanner 之后
  .addConditionalEdges('taskPlanner', routeAfterTaskPlanner)

  // taskChain 之后
  .addConditionalEdges('taskChain', routeAfterTaskChain)

  // agent 之后（统一 pluginExpert）
  .addConditionalEdges('pluginExpert', afterAgent)

  // 工具调用链 → afterTools → collaborationRouter（三路路由）
  .addEdge('allTools', 'afterTools')
  .addEdge('afterTools', 'collaborationRouter')
  .addConditionalEdges('collaborationRouter', routeAfterCollaborationRouter)

  // 总结
  .addEdge('summarizer', END)

const graph = builder.compile({ checkpointer: checkpointer as unknown as BaseCheckpointSaver })

export { graph, V2_CONFIG }

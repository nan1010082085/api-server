/**
 * Task Planner — runtime pure function.
 *
 * 从 graph/taskPlanner.ts 抽取 prompt 构建和解析逻辑，不依赖 LangGraph State。
 * 供 graph node、workflow、API 等多入口复用。
 */

import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { logger } from '../../utils/logger.js'
import { buildExpertCatalogForPrompt } from '../plugins/resolveRouterExpert.js'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface TaskPlanInput {
  /** 用户消息 */
  message: string
  /** 需求分析结果（可选，有则用于增强规划） */
  requirementAnalysis?: RequirementAnalysis
  /** 最大步骤数（默认 10） */
  maxSteps?: number
  /** 执行策略（默认 'sequential'） */
  strategy?: 'sequential' | 'mixed'
  /** 指定模型名称 */
  model?: string
}

/** 需求分析结果最小接口 — 避免对 state.ts 的硬依赖 */
export interface RequirementAnalysis {
  intent: string
  type: string
  complexity: string
  entities: Record<string, unknown>
  suggestedChain: Array<{
    agent: string
    description: string
    priority?: number
    dependencies?: string[]
  }>
}

export interface TaskPlanOutput {
  chain: TaskPlanStep[]
  strategy: string
}

export interface TaskPlanStep {
  id: string
  description: string
  expertId?: string
  legacyAgentKey?: string
  tools?: string[]
  status: 'pending' | 'running' | 'done' | 'failed'
}

/** 依赖注入 — 最小接口 */
export interface TaskPlannerContext {
  getLLM: (opts: {
    model?: string
    temperature?: number
    maxTokens?: number
    jsonMode?: boolean
  }) => Promise<{
    stream: (messages: unknown[]) => AsyncIterable<{
      content: string | unknown
    }>
  }>
}

// ────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────

function buildTaskPlannerPrompt(): string {
  const expertCatalog = buildExpertCatalogForPrompt()
  return `你是一个任务规划专家，负责将用户需求拆解为可执行的任务链。

## 你的任务

1. **分析需求**
   - 理解用户想要创建/修改的内容
   - 识别涉及的实体类型（表单、流程、页面）

2. **拆解任务**
   - 将复杂需求拆解为多个步骤
   - 每个步骤对应一个 Agent（使用 legacyAgentKey：editor/flow/page 或配置中的专家）
   - 明确每个步骤的输入和输出

3. **确定依赖关系**
   - 哪些步骤需要先完成
   - 哪些步骤可以并行执行
   - 数据如何在步骤间传递

4. **选择执行策略**
   - sequential: 顺序执行，步骤间有依赖
   - parallel: 并行执行，步骤间无依赖
   - mixed: 部分并行，部分顺序

## Agent 能力（来自插件中心）

${expertCatalog}

## 输出格式

请输出严格的 JSON 格式：

\`\`\`json
{
  "chain": [
    {
      "id": "step-1",
      "agent": "editor",
      "description": "生成订单录入表单",
      "tools": ["schema__save"],
      "status": "pending"
    },
    {
      "id": "step-2",
      "agent": "flow",
      "description": "生成订单审批流程",
      "tools": ["flow__save"],
      "status": "pending"
    }
  ],
  "strategy": "sequential"
}
\`\`\`

## 示例

输入：创建一个订单管理系统，包含订单录入、审批流程和订单列表

输出：
\`\`\`json
{
  "chain": [
    {
      "id": "step-1",
      "agent": "editor",
      "description": "生成订单录入表单",
      "tools": ["schema__save"],
      "status": "pending"
    },
    {
      "id": "step-2",
      "agent": "flow",
      "description": "生成订单审批流程",
      "tools": ["flow__save"],
      "status": "pending"
    },
    {
      "id": "step-3",
      "agent": "page",
      "description": "生成订单列表页面",
      "tools": ["page__save"],
      "status": "pending"
    }
  ],
  "strategy": "sequential"
}
\`\`\`
`
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function parsePlanResponse(raw: string): TaskPlanOutput | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logger.error({ msg: '[taskPlanner:runtime] No JSON found in response' })
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    if (!parsed.chain || !Array.isArray(parsed.chain)) {
      logger.error({ msg: '[taskPlanner:runtime] Missing or invalid chain' })
      return null
    }

    const chain: TaskPlanStep[] = (parsed.chain as Array<Record<string, unknown>>).map(
      (step, index) => ({
        id: typeof step.id === 'string' ? step.id : `step-${index + 1}`,
        description: typeof step.description === 'string' ? step.description : '',
        expertId: typeof step.expertId === 'string' ? step.expertId : undefined,
        legacyAgentKey: typeof step.agent === 'string' ? step.agent
          : typeof step.legacyAgentKey === 'string' ? step.legacyAgentKey
            : undefined,
        tools: Array.isArray(step.tools) ? step.tools as string[] : undefined,
        status: 'pending' as const,
      }),
    )

    const strategy = typeof parsed.strategy === 'string'
      ? parsed.strategy
      : parsed.strategy && typeof parsed.strategy === 'object'
        ? (parsed.strategy as Record<string, unknown>).mode as string ?? 'sequential'
        : 'sequential'

    return { chain, strategy }
  } catch (err) {
    logger.error({ msg: '[taskPlanner:runtime] Failed to parse response', error: err })
    return null
  }
}

function buildContextInfo(
  message: string,
  analysis?: RequirementAnalysis,
  userConfirmations?: Record<string, string>,
): string {
  if (!analysis) return message

  let contextInfo = `需求分析结果：
- 意图：${analysis.intent}
- 类型：${analysis.type}
- 复杂度：${analysis.complexity}
- 实体：${JSON.stringify(analysis.entities, null, 2)}
- 建议的任务链：${JSON.stringify(analysis.suggestedChain, null, 2)}`

  if (userConfirmations && Object.keys(userConfirmations).length > 0) {
    contextInfo += `\n\n用户确认：
${JSON.stringify(userConfirmations, null, 2)}`
  }

  return contextInfo
}

/** 从 suggestedChain 构建降级计划 */
function createFallbackPlan(analysis: RequirementAnalysis): TaskPlanOutput {
  return {
    chain: analysis.suggestedChain.map((step, index) => ({
      id: `step-${index + 1}`,
      description: step.description,
      legacyAgentKey: step.agent,
      status: 'pending' as const,
    })),
    strategy: 'sequential',
  }
}

// ────────────────────────────────────────────
// Core
// ────────────────────────────────────────────

/**
 * 纯函数：根据用户消息和需求分析生成任务计划。
 *
 * 与 graph/taskPlanner.ts 的区别：
 * - 不依赖 LangGraph State / Annotation
 * - getLLM 通过 context 注入
 * - 返回值为 TaskPlanOutput，而非 Partial<State>
 */
export async function planTasks(
  input: TaskPlanInput,
  context: TaskPlannerContext,
): Promise<TaskPlanOutput> {
  const { message, requirementAnalysis, strategy = 'sequential', model } = input

  if (!message.trim()) {
    logger.warn({ msg: '[taskPlanner:runtime] Empty message' })
    return { chain: [], strategy }
  }

  logger.info({
    msg: '[taskPlanner:runtime] Planning tasks',
    hasAnalysis: !!requirementAnalysis,
    content: message.substring(0, 100),
  })

  // 无需求分析时返回简单单步计划
  if (!requirementAnalysis) {
    return {
      chain: [{
        id: 'step-1',
        description: '处理用户请求',
        legacyAgentKey: 'editor',
        status: 'pending',
      }],
      strategy,
    }
  }

  try {
    const llm = await context.getLLM({
      model,
      temperature: 0,
      maxTokens: 4096,
      jsonMode: true,
    })

    const contextInfo = buildContextInfo(message, requirementAnalysis)
    const stream = await llm.stream([
      new SystemMessage(buildTaskPlannerPrompt()),
      new HumanMessage(contextInfo),
    ])

    let raw = ''
    for await (const chunk of stream) {
      const content = typeof chunk.content === 'string' ? chunk.content : ''
      if (content) raw += content
    }

    const plan = parsePlanResponse(raw)

    if (!plan || plan.chain.length === 0) {
      logger.warn({ msg: '[taskPlanner:runtime] Failed to parse plan, using suggested chain' })
      return createFallbackPlan(requirementAnalysis)
    }

    logger.info({
      msg: '[taskPlanner:runtime] Plan generated',
      steps: plan.chain.length,
      strategy: plan.strategy,
    })

    return plan
  } catch (err) {
    logger.error({ msg: '[taskPlanner:runtime] LLM call failed', error: err })
    return createFallbackPlan(requirementAnalysis)
  }
}

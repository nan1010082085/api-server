/**
 * Agent 工作流执行引擎（MVP：顺序 DAG 遍历 + 节点记录持久化）
 *
 * 参考 n8n：每个节点产生一条 AgentNodeRecord，支持 waiting(HITL) 暂停。
 */

import { HumanMessage, SystemMessage, AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { AgentWorkflowExecutionModel } from '../models/agentWorkflow.js'
import type { IAgentWorkflowExecution } from '../models/agentWorkflow.js'
import { getLLM } from './llmCache.js'
import { logger } from '../../utils/logger.js'
import { leanDoc } from '../../utils/leanDoc.js'
import {
  ROUTER_SYSTEM_PROMPT,
} from '@schema-platform/platform-shared/ai/promptBuilder'
import { normalizeToolName } from '@schema-platform/platform-shared/ai/toolNames'
import { getToolSync, ensureToolsReady, getToolsByNames, isHttpTool } from '../tools/registry.js'
import { executeHttpRequest } from '../tools/httpToolExecutor.js'
import { getPluginRegistry } from '../plugins/index.js'
import { runRegisteredExpert } from '../plugins/dispatchExpert.js'
import type { LegacyAgentKey } from '../plugins/types.js'
import { extractJsonFromResponse } from '../graph/agentBase.js'
import {
  resolveIntent,
  analyzeRequirement,
  planTasks,
  generateSummary,
  routeCollaboration,
} from '../runtime/index.js'
import type { SummarizerContext } from '../runtime/summarizer.js'
import type { RequirementAnalyzerContext } from '../runtime/requirementAnalyzer.js'
import type { TaskPlannerContext } from '../runtime/taskPlanner.js'
import { getDocumentWithText, reprocessDocumentFromStorage, analyzeDocumentVision, chunkText } from './documentService.js'
import { processFile, performVisionAnalysis, isImageType } from './fileService.js'
import { extractNodeOutputError, nodeFailure } from './agentWorkflowNodeErrors.js'
import { dispatchWorkflowCompleteCallback } from './agentWorkflowCompleteCallback.js'
import { WorkflowNodeMetricModel } from '../models/workflowNodeMetric.js'
import { pushWorkflowExecutionUpdate, clearWorkflowExecutionPush } from '../workflowExecutionPush.js'
import { getIO } from '../../socket.js'
import { resolveWorkflowApiFile } from './agentWorkflowFileFetch.js'
import { resolveWorkflowTemplate } from './agentWorkflowTemplateResolver.js'
import { compressImage } from './imageCompress.js'
import {
  normalizeConversationTurns,
  trimConversationTurns,
  mergeConversationSources,
  extractMessageFromContext,
  extractAssistantContent,
  resolveDocumentIdFromNodeData,
  resolveWorkflowUploadFile,
  type WorkflowConversationTurn,
} from './agentWorkflowConversation.js'
import type { StructuredTool } from '@langchain/core/tools'

interface WorkflowGraphNode {
  id: string
  type: string
  data?: {
    label?: string
    prompt?: string
    systemPrompt?: string
    model?: string
    agentType?: string
    toolName?: string
    toolArgs?: Record<string, unknown>
    expression?: string
    confirmMessage?: string
    confirmQuestions?: Array<{
      id: string
      question: string
      options?: string[]
      required?: boolean
    }>
    inheritUpstreamQuestions?: boolean
    documentSource?: 'documentId' | 'inputField' | 'stream' | 'api'
    documentId?: string
    inputField?: string
    streamField?: string
    fetchUrl?: string
    fetchMethod?: 'GET' | 'POST'
    fetchHeaders?: Record<string, string>
    fetchBody?: string
    fetchResponseMode?: 'binary' | 'json-base64' | 'json-url'
    fetchContentPath?: string
    fetchFilenamePath?: string
    fetchMimetypePath?: string
    fetchFilename?: string
    fetchMimetype?: string
    visionPrompt?: string
    visionImageWidth?: number
    visionImageQuality?: number
    outputSource?: 'lastOutput' | 'node' | 'custom'
    outputNodeId?: string
    outputTemplate?: string
    memoryMode?: 'read' | 'append' | 'reset'
    memoryRole?: 'user' | 'assistant'
    messageField?: string
    contentSource?: 'input' | 'lastOutput'
    maxHistoryTurns?: number
    useConversationHistory?: boolean
    appendAssistantReply?: boolean
    expertId?: string
    contextSource?: string
    enableMultiIntentChain?: boolean
    fallbackExpertId?: string
    customPrompt?: string
    enableRag?: boolean
    enableTools?: boolean
    completenessThreshold?: number
    maxSteps?: number
    strategy?: 'sequential' | 'mixed'
    taskChain?: {
      steps: Array<{
        id: string
        description: string
        expertId?: string
        legacyAgentKey?: string
        status: string
      }>
      currentStepIndex: number
    }
    maxExecutions?: number
    toolResults?: Array<{ toolName: string; output: unknown }>
    collaborationHistory?: Array<{
      fromExpertId: string
      toExpertId: string
      reason: string
      timestamp: Date
    }>
    maxCollaborationRounds?: number
  }
}

interface WorkflowGraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  data?: { branch?: 'true' | 'false' | 'default' }
}

interface WorkflowGraph {
  entryNodeId: string
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

interface ExecuteParams {
  executionId: string
  graph: WorkflowGraph
  input: Record<string, unknown>
  resumeFromWaiting?: boolean
}

interface NodeRunResult {
  output: unknown
  branch?: 'true' | 'false'
  wait?: boolean
  error?: string
}

const WORKFLOW_LLM_TIMEOUT_MS = Number(process.env.WORKFLOW_LLM_TIMEOUT_MS ?? 120_000)
const WORKFLOW_STREAM_FLUSH_MS = 200

function chunkContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return typeof part.text === 'string' ? part.text : ''
        }
        return ''
      })
      .join('')
  }
  return ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForExecutionCancelled(executionId: string): Promise<never> {
  while (true) {
    if (await isExecutionCancelled(executionId)) {
      throw new Error('用户手动停止')
    }
    await sleep(500)
  }
}

async function invokeLLMWithGuard(
  executionId: string,
  llm: Awaited<ReturnType<typeof getLLM>>,
  messages: BaseMessage[],
): Promise<Awaited<ReturnType<typeof llm.invoke>>> {
  const timeoutMs = Number.isFinite(WORKFLOW_LLM_TIMEOUT_MS) && WORKFLOW_LLM_TIMEOUT_MS > 0
    ? WORKFLOW_LLM_TIMEOUT_MS
    : 120_000

  return Promise.race<Awaited<ReturnType<typeof llm.invoke>>>([
    llm.invoke(messages),
    sleep(timeoutMs).then(() => {
      throw new Error(`LLM 调用超时（${Math.round(timeoutMs / 1000)}s）`)
    }),
    waitForExecutionCancelled(executionId),
  ])
}

async function setStreamingOutput(
  executionId: string,
  nodeId: string,
  nodeType: string,
  text: string,
): Promise<void> {
  await AgentWorkflowExecutionModel.updateOne(
    { _id: executionId },
    {
      $set: {
        streamingOutput: {
          nodeId,
          nodeType,
          text,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  )
  pushWorkflowExecutionUpdate(executionId)
}

async function clearStreamingOutput(executionId: string): Promise<void> {
  await AgentWorkflowExecutionModel.updateOne(
    { _id: executionId },
    { $unset: { streamingOutput: 1 } },
  )
}

function emitWorkflowNodeEvent(
  executionId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  try {
    const io = getIO()
    if (!io) return
    io.to(`workflow:${executionId}`).emit('workflow:node-event', {
      executionId,
      eventType,
      ...payload,
    })
  } catch {
    // best-effort, do not break execution
  }
}

async function streamLLMWithGuard(
  executionId: string,
  nodeId: string,
  nodeType: string,
  llm: Awaited<ReturnType<typeof getLLM>>,
  messages: BaseMessage[],
): Promise<string> {
  const timeoutMs = Number.isFinite(WORKFLOW_LLM_TIMEOUT_MS) && WORKFLOW_LLM_TIMEOUT_MS > 0
    ? WORKFLOW_LLM_TIMEOUT_MS
    : 120_000

  const streamTask = async (): Promise<string> => {
    const stream = await llm.stream(messages)
    let content = ''
    let lastFlush = 0

    for await (const chunk of stream) {
      if (await isExecutionCancelled(executionId)) {
        throw new Error('用户手动停止')
      }

      const delta = chunkContentToText(chunk.content)
      if (delta) {
        content += delta
        const now = Date.now()
        if (now - lastFlush >= WORKFLOW_STREAM_FLUSH_MS) {
          await setStreamingOutput(executionId, nodeId, nodeType, content)
          lastFlush = now
        }
      }
    }

    if (content) {
      await setStreamingOutput(executionId, nodeId, nodeType, content)
    }

    return content
  }

  return Promise.race<string>([
    streamTask(),
    sleep(timeoutMs).then(() => {
      throw new Error(`LLM 调用超时（${Math.round(timeoutMs / 1000)}s）`)
    }),
    waitForExecutionCancelled(executionId),
  ])
}

function resolveNodeError(result: NodeRunResult): string | null {
  if (result.error?.trim()) return result.error.trim()
  return extractNodeOutputError(result.output)
}

async function recordNodeMetric(params: {
  tenantId: string
  workflowId: string
  workflowName: string
  executionId: string
  nodeId: string
  nodeType: string
  nodeName: string
  duration: number
  success: boolean
  error?: string
}): Promise<void> {
  try {
    await WorkflowNodeMetricModel.create({
      tenantId: params.tenantId,
      workflowId: params.workflowId,
      workflowName: params.workflowName,
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      nodeName: params.nodeName,
      executionId: params.executionId,
      duration: params.duration,
      success: params.success,
      error: params.error,
    })
  } catch (err) {
    logger.warn({
      msg: '[agentWorkflow] failed to record node metric',
      nodeId: params.nodeId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

interface RuntimeContext {
  executionId: string
  triggeredBy: string
  input: Record<string, unknown>
  lastOutput: unknown
  nodeOutputs: Record<string, unknown>
  conversationHistory: WorkflowConversationTurn[]
}

async function loadExecutionConversation(executionId: string): Promise<WorkflowConversationTurn[]> {
  const execution = leanDoc<{ conversationHistory?: unknown }>(
    await AgentWorkflowExecutionModel.findById(executionId).lean(),
  )
  return normalizeConversationTurns(execution?.conversationHistory)
}

async function saveExecutionConversation(
  executionId: string,
  turns: WorkflowConversationTurn[],
): Promise<void> {
  await AgentWorkflowExecutionModel.updateOne(
    { _id: executionId },
    { $set: { conversationHistory: turns } },
  )
}

async function initExecutionConversation(
  executionId: string,
  input: Record<string, unknown>,
): Promise<WorkflowConversationTurn[]> {
  const execution = leanDoc<{ conversationHistory?: unknown }>(
    await AgentWorkflowExecutionModel.findById(executionId).lean(),
  )
  const existing = normalizeConversationTurns(execution?.conversationHistory)
  if (existing.length) return existing

  const sources: unknown[] = [input.history, input.conversationHistory]
  const continueFrom = input.continueFromExecutionId
  if (typeof continueFrom === 'string' && continueFrom.trim()) {
    const parent = leanDoc<{ conversationHistory?: unknown }>(
      await AgentWorkflowExecutionModel.findById(continueFrom.trim()).lean(),
    )
    if (parent?.conversationHistory) {
      sources.unshift(parent.conversationHistory)
    }
  }

  const merged = trimConversationTurns(mergeConversationSources(...sources), 50)
  if (merged.length) {
    await saveExecutionConversation(executionId, merged)
  }
  return merged
}

async function appendNodeRecord(
  executionId: string,
  record: Record<string, unknown>,
) {
  await AgentWorkflowExecutionModel.updateOne(
    { _id: executionId },
    { $push: { nodeRecords: record } },
  )
  pushWorkflowExecutionUpdate(executionId, { immediate: true })
}

async function updateNodeRecord(
  executionId: string,
  nodeId: string,
  patch: Record<string, unknown>,
) {
  const execution = await AgentWorkflowExecutionModel.findById(executionId)
  if (!execution) return
  const idx = execution.nodeRecords.findIndex((r: { nodeId?: string }) => r.nodeId === nodeId)
  if (idx === -1) return
  Object.assign(execution.nodeRecords[idx], patch)
  execution.markModified('nodeRecords')
  await execution.save()
  pushWorkflowExecutionUpdate(executionId, { immediate: true })
}

async function finishExecution(
  executionId: string,
  status: 'success' | 'error' | 'waiting' | 'cancelled',
  error?: string,
) {
  const execution = await AgentWorkflowExecutionModel.findById(executionId)
  if (!execution) return
  if (execution.status === 'cancelled' && status !== 'cancelled') return
  const finishedAt = new Date()
  execution.status = status
  execution.finishedAt = finishedAt
  execution.durationMs = finishedAt.getTime() - execution.startedAt.getTime()
  if (error) execution.error = error
  execution.streamingOutput = undefined
  await execution.save()
  clearWorkflowExecutionPush(executionId)
  pushWorkflowExecutionUpdate(executionId, { immediate: true })

  if (status === 'success' || status === 'error' || status === 'cancelled') {
    void dispatchWorkflowCompleteCallback(
      execution.toObject() as IAgentWorkflowExecution & { _id: unknown },
    )
  }
}

async function isExecutionCancelled(executionId: string): Promise<boolean> {
  const execution = leanDoc<{ status?: string }>(
    await AgentWorkflowExecutionModel.findById(executionId).select('status').lean(),
  )
  return execution?.status === 'cancelled'
}

async function stopExecutionIfCancelled(
  executionId: string,
  runningNodeId?: string,
): Promise<boolean> {
  if (!(await isExecutionCancelled(executionId))) return false
  if (runningNodeId) {
    const finishedAt = new Date()
    await updateNodeRecord(executionId, runningNodeId, {
      status: 'skipped',
      finishedAt,
      error: '用户手动停止',
    })
  }
  return true
}

function getOutgoingEdges(graph: WorkflowGraph, nodeId: string): WorkflowGraphEdge[] {
  return graph.edges.filter((e) => e.source === nodeId)
}

function getNode(graph: WorkflowGraph, nodeId: string): WorkflowGraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId)
}

function resolveTemplate(text: string, ctx: RuntimeContext): string {
  return resolveWorkflowTemplate(text, ctx)
}

function evaluateIfExpression(expression: string, ctx: RuntimeContext): boolean {
  const trimmed = expression.trim()
  if (!trimmed) return true
  try {
    const fn = new Function(
      'input',
      'lastOutput',
      'nodeOutputs',
      `return Boolean(${trimmed})`,
    )
    return fn(ctx.input, ctx.lastOutput, ctx.nodeOutputs) === true
  } catch {
    return false
  }
}

function pickNextNode(
  graph: WorkflowGraph,
  currentId: string,
  branch?: 'true' | 'false',
): string | null {
  const edges = getOutgoingEdges(graph, currentId)
  if (edges.length === 0) return null
  if (branch) {
    const matched = edges.find((e) => e.data?.branch === branch)
    if (matched) return matched.target
  }
  const defaultEdge = edges.find((e) => e.data?.branch === 'default' || !e.data?.branch)
  return (defaultEdge ?? edges[0]).target
}

function resolveTemplateInArgs(
  args: Record<string, unknown>,
  ctx: RuntimeContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      result[key] = resolveTemplate(value, ctx)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? resolveTemplate(item, ctx)
          : item && typeof item === 'object'
            ? resolveTemplateInArgs(item as Record<string, unknown>, ctx)
            : item,
      )
    } else if (value && typeof value === 'object') {
      result[key] = resolveTemplateInArgs(value as Record<string, unknown>, ctx)
    } else {
      result[key] = value
    }
  }
  return result
}

function buildEmptyRagSearchOutput(query: string, warning?: string) {
  const q = query.trim()
  return {
    success: true,
    data: { total: 0, schemas: [] },
    summary: q ? `没有找到与「${q}」语义相关的 Schema` : '没有找到语义相关的 Schema',
    ...(warning ? { degraded: true, warning } : {}),
  }
}

function normalizeRagToolOutput(
  output: unknown,
  args: Record<string, unknown>,
): unknown {
  if (typeof output === 'string') {
    const trimmed = output.trim()
    if (/^\d{3}\s+status code/i.test(trimmed)) {
      return buildEmptyRagSearchOutput(String(args.query ?? ''), trimmed)
    }
    try {
      return normalizeRagToolOutput(JSON.parse(trimmed), args)
    } catch {
      return output
    }
  }
  if (!output || typeof output !== 'object') return output
  const obj = output as Record<string, unknown>
  if (obj.success === false && obj.recoverable === true) {
    return buildEmptyRagSearchOutput(
      String(args.query ?? ''),
      typeof obj.error === 'string' ? obj.error : undefined,
    )
  }
  return output
}

async function dispatchTool(
  toolName: string,
  rawArgs: Record<string, unknown>,
  ctx: RuntimeContext,
): Promise<{ output: unknown; error?: string }> {
  const args = resolveTemplateInArgs(rawArgs ?? {}, ctx)
  const normalized = normalizeToolName(toolName)

  if (isHttpTool(normalized)) {
    const result = await executeHttpRequest(args as Parameters<typeof executeHttpRequest>[0])
    if (result.error) {
      return {
        output: { tool: toolName, ...result.output, error: result.error },
        error: result.error,
      }
    }
    return { output: result.output }
  }

  try {
    await ensureToolsReady()
    const tool = getToolSync(normalized)
    if (!tool) {
      return {
        output: { tool: toolName, args, message: `工具「${toolName}」未注册` },
        error: `工具「${toolName}」未注册`,
      }
    }

    const rawResult = await tool.invoke(args)
    let output: unknown = rawResult
    if (typeof rawResult === 'string') {
      try {
        output = JSON.parse(rawResult)
      } catch {
        output = rawResult
      }
    }
    if (normalized === 'rag__search') {
      output = normalizeRagToolOutput(output, args)
    }
    const outputError = extractNodeOutputError(output)
    return outputError ? { output, error: outputError } : { output }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (normalized === 'rag__search' && /^\d{3}\s+status code/i.test(msg)) {
      return { output: buildEmptyRagSearchOutput(String(args.query ?? ''), msg) }
    }
    return { output: { tool: toolName, error: msg }, error: msg }
  }
}

// ────────────────────────────────────────────
// HITL 确认问题解析
// ────────────────────────────────────────────

interface HitlConfirmQuestion {
  id: string
  question: string
  options?: string[]
  required?: boolean
}

function normalizeHitlQuestions(raw: unknown[]): HitlConfirmQuestion[] {
  return raw
    .filter((q): q is Record<string, unknown> => q != null && typeof q === 'object')
    .map((q, i) => ({
      id: String(q.id ?? `q${i + 1}`),
      question: String(q.question ?? q.text ?? ''),
      options: Array.isArray(q.options) ? q.options.map(String) : undefined,
      required: q.required !== false,
    }))
    .filter((q) => q.question.trim())
}

function extractConfirmQuestionsFromValue(value: unknown): HitlConfirmQuestion[] {
  if (value == null) return []
  if (typeof value === 'string') {
    try {
      const jsonMatch = value.match(/\{[\s\S]*\}/)
      if (jsonMatch) return extractConfirmQuestionsFromValue(JSON.parse(jsonMatch[0]))
    } catch { /* ignore */ }
    return []
  }
  if (typeof value !== 'object') return []

  const obj = value as Record<string, unknown>
  if (Array.isArray(obj.confirmQuestions)) {
    return normalizeHitlQuestions(obj.confirmQuestions)
  }
  if (obj.analysis && typeof obj.analysis === 'object') {
    const analysis = obj.analysis as Record<string, unknown>
    if (Array.isArray(analysis.confirmQuestions)) {
      return normalizeHitlQuestions(analysis.confirmQuestions)
    }
  }
  if (typeof obj.text === 'string') {
    return extractConfirmQuestionsFromValue(obj.text)
  }
  return []
}

function resolveHitlQuestions(
  data: WorkflowGraphNode['data'],
  ctx: RuntimeContext,
): HitlConfirmQuestion[] {
  const staticQs = normalizeHitlQuestions(
    Array.isArray(data?.confirmQuestions) ? data.confirmQuestions as unknown[] : [],
  )
  const inherit = data?.inheritUpstreamQuestions !== false
  const upstreamQs = inherit ? extractConfirmQuestionsFromValue(ctx.lastOutput) : []

  const seen = new Set<string>()
  const merged: HitlConfirmQuestion[] = []
  for (const q of [...staticQs, ...upstreamQs]) {
    if (seen.has(q.id)) continue
    seen.add(q.id)
    merged.push(q)
  }
  return merged
}

// ────────────────────────────────────────────
// Agent dispatch — 真实调度平台专家 Agent
// ────────────────────────────────────────────

const AGENT_MAX_TOOL_ROUNDS = 3

const VALID_AGENT_TYPES = new Set(['editor', 'flow', 'page', 'general'])

function resolveAgentTargetFromNode(node: WorkflowGraphNode): string | null {
  if (node.type === 'expert') {
    const expertId = node.data?.expertId?.trim()
    return expertId || null
  }
  return null
}

function normalizeDetectedAgent(value: unknown): string {
  const agent = typeof value === 'string' ? value.trim() : ''
  if (agent.includes('.')) return agent
  const lower = agent.toLowerCase()
  return VALID_AGENT_TYPES.has(lower) ? lower : 'general'
}

function autoDetectAgentType(input: unknown, ctx: RuntimeContext): string {
  const text = `${typeof input === 'string' ? input : JSON.stringify(input ?? '')} ${JSON.stringify(ctx.lastOutput ?? '')}`
  const matched = getPluginRegistry().matchExpertsByRouting({
    text,
    runtime: 'workflow',
  })
  const first = matched[0]
  if (first?.legacyAgentKey) return first.legacyAgentKey
  if (first?.id) return first.id
  return 'general'
}

async function detectAgentIntent(
  input: unknown,
  ctx: RuntimeContext,
): Promise<{ agent: string; source: 'keyword' | 'llm' }> {
  const keywordAgent = autoDetectAgentType(input, ctx)
  if (keywordAgent !== 'general') {
    return { agent: keywordAgent, source: 'keyword' }
  }

  const userText = typeof input === 'string'
    ? input
    : JSON.stringify(input ?? ctx.lastOutput ?? ctx.input ?? {})
  const contextHint = ctx.lastOutput != null
    ? `\n\n[上游节点输出]\n${JSON.stringify(ctx.lastOutput)}`
    : ''

  try {
    const llm = await getLLM({ temperature: 0, maxTokens: 256 })
    const response = await llm.invoke([
      new SystemMessage(ROUTER_SYSTEM_PROMPT),
      new HumanMessage(`${userText}${contextHint}`),
    ])
    const raw = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)
    const parsed = extractJsonFromResponse(raw)
    if (parsed) {
      if (parsed.target === 'chain' && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        const first = parsed.steps[0] as Record<string, unknown>
        return { agent: normalizeDetectedAgent(first.agent), source: 'llm' }
      }
      if (parsed.target) {
        return { agent: normalizeDetectedAgent(parsed.target), source: 'llm' }
      }
      if (parsed.agent) {
        return { agent: normalizeDetectedAgent(parsed.agent), source: 'llm' }
      }
    }
  } catch (err) {
    logger.warn({
      msg: '[agentWorkflow] intent LLM detection failed, falling back to keyword',
      err: err instanceof Error ? err.message : String(err),
    })
  }

  return { agent: keywordAgent, source: 'keyword' }
}

async function dispatchAgent(
  agentTypeOrExpertId: string,
  input: unknown,
  ctx: RuntimeContext,
): Promise<{ output: unknown }> {
  let resolvedTarget = agentTypeOrExpertId
  if (agentTypeOrExpertId === 'auto') {
    const detected = await detectAgentIntent(input, ctx)
    resolvedTarget = detected.agent
  }

  const ref = resolvedTarget.includes('.')
    ? { expertId: resolvedTarget }
    : { legacyAgentKey: resolvedTarget as LegacyAgentKey }

  const userInput = typeof input === 'string' ? input : JSON.stringify(input ?? ctx.lastOutput ?? {})
  const contextHint = ctx.lastOutput != null
    ? `\n\n[上游节点输出]\n${JSON.stringify(ctx.lastOutput)}`
    : ''

  const { text: content, truncated, expertId, legacyAgentKey } = await runRegisteredExpert({
    ref,
    userContent: userInput + contextHint,
    maxToolRounds: AGENT_MAX_TOOL_ROUNDS,
    isCancelled: () => isExecutionCancelled(ctx.executionId),
    generalPromptBuilder: () => '你是通用 AI 助手，请根据上游节点输出完成任务。',
  })

  const agent = legacyAgentKey ?? expertId

  return {
    output: {
      text: content,
      agent,
      expertId,
      ...(truncated ? { truncated: true } : {}),
    },
  }
}

async function runNode(
  node: WorkflowGraphNode,
  ctx: RuntimeContext,
): Promise<NodeRunResult> {
  const data = node.data ?? {}

  if (node.type === 'tool') {
    const toolName = data.toolName?.trim() ?? ''
    if (!toolName) {
      return nodeFailure('未选择工具')
    }
    const result = await dispatchTool(toolName, data.toolArgs ?? {}, ctx)
    const error = result.error ?? extractNodeOutputError(result.output) ?? undefined
    return { output: result.output, error }
  }

  if (node.type === 'agent-intent' || node.type === 'expert') {
    const agentInput = data.prompt?.trim() ? resolveTemplate(data.prompt, ctx) : ctx.lastOutput

    if (node.type === 'agent-intent') {
      const { agent: detectedAgent, source } = await detectAgentIntent(agentInput, ctx)
      const result = await dispatchAgent(detectedAgent, agentInput, ctx)
      const output = result.output as Record<string, unknown>
      return {
        output: {
          ...output,
          detectedAgent,
          intentSource: source,
          agent: detectedAgent,
        },
      }
    }

    const agentType = resolveAgentTargetFromNode(node)
    if (!agentType) {
      return nodeFailure('专家节点未选择插件专家')
    }
    const result = await dispatchAgent(agentType, agentInput, ctx)
    return { output: result.output }
  }

  switch (node.type) {
    case 'manual-trigger':
      return { output: { ...ctx.input } }

    case 'webhook-trigger':
      return { output: { ...ctx.input } }

    case 'document-parse': {
      const source = data.documentSource ?? 'stream'
      const parseModel = data.model && data.model !== 'default' ? data.model : undefined
      if (source === 'api') {
        try {
          const streamFile = await resolveWorkflowApiFile(data, (text) => resolveTemplate(text, ctx))
          const processed = await processFile(
            streamFile.content,
            streamFile.filename,
            streamFile.mimetype,
            parseModel,
          )
          const chunks = chunkText(processed.text)
          return {
            output: {
              filename: processed.filename,
              mimetype: processed.mimetype,
              size: processed.size,
              text: processed.text,
              chunks,
              extractionMethod: processed.extractionMethod,
              hasOriginalFile: false,
              textLength: processed.text.length,
              source: 'api',
            },
          }
        } catch (err) {
          return nodeFailure(err instanceof Error ? err.message : String(err))
        }
      }
      if (source === 'stream') {
        const streamFile = await resolveWorkflowUploadFile(
          data,
          ctx.input,
          ctx.lastOutput,
          { userId: ctx.triggeredBy },
        )
        if (!streamFile) {
          const field = data.streamField?.trim() || 'file'
          return nodeFailure(
            `未指定上传文件流（$input.${field}）。请上传文件，或在 Chat 中附加附件后触发。`,
          )
        }
        const processed = await processFile(
          streamFile.content,
          streamFile.filename,
          streamFile.mimetype,
          parseModel,
        )
        const chunks = chunkText(processed.text)
        return {
          output: {
            filename: processed.filename,
            mimetype: processed.mimetype,
            size: processed.size,
            text: processed.text,
            chunks,
            extractionMethod: processed.extractionMethod,
            hasOriginalFile: false,
            textLength: processed.text.length,
            source: 'stream',
          },
        }
      }

      const documentId = resolveDocumentIdFromNodeData(
        data,
        (text) => resolveTemplate(text, ctx),
        ctx.input,
        ctx.lastOutput,
      )
      if (!documentId) {
        return nodeFailure('未指定文档 ID')
      }
      const doc = await getDocumentWithText(documentId)
      if (!doc) {
        return nodeFailure(`文档不存在: ${documentId}`)
      }

      let text = doc.text as string
      let chunks = doc.chunks
      let extractionMethod = doc.extractionMethod
      if (!text?.trim() && doc.storagePath && doc.uploadedBy) {
        const reparsed = await reprocessDocumentFromStorage(
          documentId,
          doc.uploadedBy as string,
        )
        if (reparsed) {
          text = reparsed.text as string
          chunks = reparsed.chunks
          extractionMethod = reparsed.extractionMethod
        }
      }

      return {
        output: {
          documentId,
          filename: doc.filename,
          mimetype: doc.mimetype,
          size: doc.size,
          text,
          chunks,
          summary: doc.summary,
          extractionMethod,
          hasOriginalFile: !!doc.storagePath,
          textLength: text?.length ?? 0,
        },
      }
    }

    case 'vision-analyze': {
      const source = data.documentSource ?? 'stream'
      const visionPrompt = data.visionPrompt?.trim()
        ? resolveTemplate(data.visionPrompt, ctx)
        : undefined
      const visionModel = data.model && data.model !== 'default' ? data.model : undefined
      const compressOpts = {
        maxWidth: data.visionImageWidth,
        quality: data.visionImageQuality,
      }
      const needCompress = !!(compressOpts.maxWidth || compressOpts.quality)

      if (source === 'api') {
        try {
          const streamFile = await resolveWorkflowApiFile(data, (text) => resolveTemplate(text, ctx))
          if (!isImageType(streamFile.mimetype)) {
            return nodeFailure(`查询接口返回的不是图片类型: ${streamFile.mimetype}`)
          }
          let base64 = streamFile.content.toString('base64')
          let mimetype = streamFile.mimetype
          let size = streamFile.content.length
          if (needCompress) {
            const compressed = await compressImage(streamFile.content, streamFile.mimetype, compressOpts)
            base64 = compressed.base64
            mimetype = compressed.mimeType
            size = Math.round(compressed.base64.length * 0.75)
          }
          const description = await performVisionAnalysis(base64, mimetype, visionPrompt, visionModel)
          return {
            output: {
              filename: streamFile.filename,
              mimetype,
              size,
              description,
              mode: 'vision' as const,
              source: 'api',
              ...(needCompress ? { compressed: true, originalSize: streamFile.content.length } : {}),
            },
          }
        } catch (err) {
          return nodeFailure(err instanceof Error ? err.message : String(err))
        }
      }

      if (source === 'stream') {
        const streamFile = await resolveWorkflowUploadFile(
          data,
          ctx.input,
          ctx.lastOutput,
          { userId: ctx.triggeredBy },
        )
        if (!streamFile) {
          const field = data.streamField?.trim() || 'file'
          return nodeFailure(
            `未指定图片上传流（$input.${field}）。请上传图片，或在 Chat 中附加图片后触发。`,
          )
        }
        if (!isImageType(streamFile.mimetype)) {
          return nodeFailure(`上传流不是图片类型: ${streamFile.mimetype}`)
        }
        let base64 = streamFile.content.toString('base64')
        let mimetype = streamFile.mimetype
        let size = streamFile.content.length
        if (needCompress) {
          const compressed = await compressImage(streamFile.content, streamFile.mimetype, compressOpts)
          base64 = compressed.base64
          mimetype = compressed.mimeType
          size = Math.round(compressed.base64.length * 0.75)
        }
        const description = await performVisionAnalysis(base64, mimetype, visionPrompt, visionModel)
        return {
          output: {
            filename: streamFile.filename,
            mimetype,
            size,
            description,
            mode: 'vision' as const,
            source: 'stream',
            ...(needCompress ? { compressed: true, originalSize: streamFile.content.length } : {}),
          },
        }
      }

      const documentId = resolveDocumentIdFromNodeData(
        data,
        (text) => resolveTemplate(text, ctx),
        ctx.input,
        ctx.lastOutput,
      )
      if (!documentId) {
        return nodeFailure('未指定图片 documentId')
      }
      const result = await analyzeDocumentVision(documentId, {
        visionPrompt,
        userId: ctx.triggeredBy,
      })
      if (!result) {
        return nodeFailure(`图片不存在: ${documentId}`)
      }
      return { output: result }
    }

    case 'audio-transcribe': {
      const source = data.documentSource ?? 'stream'
      const audioModel = data.model && data.model !== 'default' ? data.model : undefined

      if (source === 'api') {
        try {
          const streamFile = await resolveWorkflowApiFile(data, (text) => resolveTemplate(text, ctx))
          const processed = await processFile(streamFile.content, streamFile.filename, streamFile.mimetype, audioModel)
          return {
            output: {
              filename: processed.filename,
              mimetype: processed.mimetype,
              size: processed.size,
              text: processed.text,
              textLength: processed.text.length,
              extractionMethod: processed.extractionMethod,
              source: 'api',
            },
          }
        } catch (err) {
          return nodeFailure(err instanceof Error ? err.message : String(err))
        }
      }

      if (source === 'stream') {
        const streamFile = await resolveWorkflowUploadFile(data, ctx.input, ctx.lastOutput, { userId: ctx.triggeredBy })
        if (!streamFile) {
          const field = data.streamField?.trim() || 'file'
          return nodeFailure(`未指定音频文件流（$input.${field}）。请上传音频文件后触发。`)
        }
        const processed = await processFile(streamFile.content, streamFile.filename, streamFile.mimetype, audioModel)
        return {
          output: {
            filename: processed.filename,
            mimetype: processed.mimetype,
            size: processed.size,
            text: processed.text,
            textLength: processed.text.length,
            extractionMethod: processed.extractionMethod,
            source: 'stream',
          },
        }
      }

      return nodeFailure('音频转录仅支持 stream 和 api 来源')
    }

    case 'video-analyze': {
      const source = data.documentSource ?? 'stream'
      const visionPrompt = data.visionPrompt?.trim()
        ? resolveTemplate(data.visionPrompt, ctx)
        : undefined
      const videoModel = data.model && data.model !== 'default' ? data.model : undefined

      if (source === 'api') {
        try {
          const streamFile = await resolveWorkflowApiFile(data, (text) => resolveTemplate(text, ctx))
          const processed = await processFile(streamFile.content, streamFile.filename, streamFile.mimetype, videoModel)
          return {
            output: {
              filename: processed.filename,
              mimetype: processed.mimetype,
              size: processed.size,
              text: processed.text,
              textLength: processed.text.length,
              extractionMethod: processed.extractionMethod,
              source: 'api',
            },
          }
        } catch (err) {
          return nodeFailure(err instanceof Error ? err.message : String(err))
        }
      }

      if (source === 'stream') {
        const streamFile = await resolveWorkflowUploadFile(data, ctx.input, ctx.lastOutput, { userId: ctx.triggeredBy })
        if (!streamFile) {
          const field = data.streamField?.trim() || 'file'
          return nodeFailure(`未指定视频文件流（$input.${field}）。请上传视频文件后触发。`)
        }
        const processed = await processFile(streamFile.content, streamFile.filename, streamFile.mimetype, videoModel)
        return {
          output: {
            filename: processed.filename,
            mimetype: processed.mimetype,
            size: processed.size,
            text: processed.text,
            textLength: processed.text.length,
            extractionMethod: processed.extractionMethod,
            source: 'stream',
          },
        }
      }

      return nodeFailure('视频分析仅支持 stream 和 api 来源')
    }

    case 'conversation-memory': {
      const mode = data.memoryMode ?? 'read'
      const maxTurns = data.maxHistoryTurns ?? 20

      if (mode === 'reset') {
        ctx.conversationHistory = []
        await saveExecutionConversation(ctx.executionId, [])
        return { output: { history: [], count: 0, mode: 'reset' } }
      }

      if (mode === 'read') {
        return {
          output: {
            history: ctx.conversationHistory,
            count: ctx.conversationHistory.length,
            mode: 'read',
          },
        }
      }

      const role = data.memoryRole ?? 'user'
      const content =
        role === 'user' || data.contentSource === 'input'
          ? extractMessageFromContext(data.messageField ?? 'message', ctx.input, ctx.lastOutput)
          : extractAssistantContent(ctx.lastOutput)

      if (!content) {
        return nodeFailure('无可追加的对话内容')
      }

      ctx.conversationHistory = trimConversationTurns(
        [
          ...ctx.conversationHistory,
          { role, content, at: new Date().toISOString() },
        ],
        maxTurns,
      )
      await saveExecutionConversation(ctx.executionId, ctx.conversationHistory)

      return {
        output: {
          history: ctx.conversationHistory,
          count: ctx.conversationHistory.length,
          mode: 'append',
          appended: { role, content },
        },
      }
    }

    case 'llm': {
      const prompt = resolveTemplate(data.prompt ?? '', ctx)
      const system = data.systemPrompt?.trim()
        ? resolveTemplate(data.systemPrompt, ctx)
        : '你是工作流中的 LLM 节点，请根据输入完成任务。'
      const modelId = data.model?.trim() && data.model !== 'default' ? data.model : undefined
      const llm = await getLLM({ temperature: 0.3, model: modelId })
      const messages: BaseMessage[] = [new SystemMessage(system)]

      if (data.useConversationHistory) {
        const history = trimConversationTurns(
          ctx.conversationHistory,
          data.maxHistoryTurns ?? 20,
        )
        for (const turn of history) {
          if (turn.role === 'user') messages.push(new HumanMessage(turn.content))
          else if (turn.role === 'assistant') messages.push(new AIMessage(turn.content))
          else messages.push(new SystemMessage(turn.content))
        }
      }

      messages.push(
        new HumanMessage(prompt || JSON.stringify(ctx.lastOutput ?? ctx.input)),
      )

      let content = ''
      try {
        content = await streamLLMWithGuard(
          ctx.executionId,
          node.id,
          node.type,
          llm,
          messages,
        )
      } finally {
        await clearStreamingOutput(ctx.executionId)
      }

      if (data.appendAssistantReply && content.trim()) {
        ctx.conversationHistory = trimConversationTurns(
          [
            ...ctx.conversationHistory,
            { role: 'assistant', content, at: new Date().toISOString() },
          ],
          data.maxHistoryTurns ?? 20,
        )
        await saveExecutionConversation(ctx.executionId, ctx.conversationHistory)
      }

      return { output: { text: content } }
    }

    case 'if': {
      const result = evaluateIfExpression(data.expression ?? 'true', ctx)
      return { output: { result }, branch: result ? 'true' : 'false' }
    }

    case 'hitl': {
      const confirmQuestions = resolveHitlQuestions(data, ctx)
      return {
        output: {
          message: data.confirmMessage ?? '需要人工确认',
          confirmQuestions,
        },
        wait: true,
      }
    }

    case 'end': {
      const outputSource = data.outputSource ?? 'lastOutput'
      if (outputSource === 'node' && data.outputNodeId?.trim()) {
        const nodeOutput = ctx.nodeOutputs[data.outputNodeId.trim()]
        return { output: nodeOutput ?? ctx.lastOutput }
      }
      if (outputSource === 'custom' && data.outputTemplate?.trim()) {
        const resolved = resolveTemplate(data.outputTemplate, ctx)
        try {
          return { output: JSON.parse(resolved) }
        } catch {
          return { output: resolved }
        }
      }
      return { output: ctx.lastOutput }
    }

    case 'intent-router': {
      const message = data.prompt?.trim()
        ? resolveTemplate(data.prompt, ctx)
        : typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : JSON.stringify(ctx.lastOutput ?? '')
      if (!message.trim()) {
        return nodeFailure('intent-router: 无输入消息')
      }
      const registry = getPluginRegistry()
      const intentResult = await resolveIntent(
        {
          message,
          contextSource: data.contextSource,
          enableMultiIntentChain: data.enableMultiIntentChain,
          fallbackExpertId: data.fallbackExpertId,
        },
        { registry },
      )
      emitWorkflowNodeEvent(ctx.executionId, 'route_decided', {
        nodeId: node.id,
        expertId: intentResult.expertId,
        legacyAgentKey: intentResult.legacyAgentKey,
        routeReason: intentResult.routeReason,
      })
      return {
        output: {
          expertId: intentResult.expertId,
          legacyAgentKey: intentResult.legacyAgentKey,
          chainPreview: intentResult.chainPreview,
          routeReason: intentResult.routeReason,
        },
      }
    }

    case 'summarizer': {
      const steps = data.taskChain?.steps?.map((s) => ({
        description: s.description,
        output: String(ctx.nodeOutputs[s.id] ?? ''),
        status: s.status,
      })) ?? []
      const userMessage = data.prompt?.trim()
        ? resolveTemplate(data.prompt, ctx)
        : typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : undefined

      let summaryText = ''
      try {
        for await (const chunk of generateSummary(
          {
            steps,
            userMessage,
            customPrompt: data.customPrompt,
          },
          { getLLM: getLLM as unknown as SummarizerContext['getLLM'] },
        )) {
          summaryText += chunk
          emitWorkflowNodeEvent(ctx.executionId, 'summary_stream', {
            nodeId: node.id,
            chunk,
            accumulated: summaryText,
          })
          await setStreamingOutput(ctx.executionId, node.id, node.type, summaryText)
        }
      } finally {
        await clearStreamingOutput(ctx.executionId)
      }

      return { output: { text: summaryText } }
    }

    case 'requirement-analyzer': {
      const message = data.prompt?.trim()
        ? resolveTemplate(data.prompt, ctx)
        : typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : JSON.stringify(ctx.lastOutput ?? '')
      if (!message.trim()) {
        return nodeFailure('requirement-analyzer: 无输入消息')
      }
      const analysis = await analyzeRequirement(
        {
          message,
          contextSource: data.contextSource,
          enableRag: data.enableRag,
          enableTools: data.enableTools,
          completenessThreshold: data.completenessThreshold,
        },
        {
          getLLM: getLLM as unknown as RequirementAnalyzerContext['getLLM'],
          userId: ctx.triggeredBy,
        },
      )
      if (!analysis) {
        return nodeFailure('需求分析失败：LLM 返回空结果')
      }
      emitWorkflowNodeEvent(ctx.executionId, 'requirement_analyzed', {
        nodeId: node.id,
        analysis,
      })
      return { output: analysis }
    }

    case 'task-planner': {
      const message = data.prompt?.trim()
        ? resolveTemplate(data.prompt, ctx)
        : typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : JSON.stringify(ctx.lastOutput ?? '')
      if (!message.trim()) {
        return nodeFailure('task-planner: 无输入消息')
      }
      const plan = await planTasks(
        {
          message,
          maxSteps: data.maxSteps,
          strategy: data.strategy,
        },
        {
          getLLM: getLLM as unknown as TaskPlannerContext['getLLM'],
        },
      )
      return {
        output: {
          chain: plan.chain,
          strategy: plan.strategy,
          stepCount: plan.chain.length,
        },
      }
    }

    case 'task-chain': {
      const taskChain = data.taskChain
      if (!taskChain || !Array.isArray(taskChain.steps) || taskChain.steps.length === 0) {
        return nodeFailure('task-chain: 无任务步骤')
      }
      const steps = taskChain.steps.map((s) => ({ ...s }))
      const maxExecutions = data.maxExecutions ?? steps.length * 3
      let currentStepIndex = taskChain.currentStepIndex ?? 0
      let executionCount = 0

      while (currentStepIndex < steps.length) {
        if (executionCount >= maxExecutions) {
          return nodeFailure(`task-chain: 超过最大执行次数 ${maxExecutions}，疑似死循环`)
        }
        if (await isExecutionCancelled(ctx.executionId)) {
          throw new Error('用户手动停止')
        }

        const step = steps[currentStepIndex]
        step.status = 'running'

        const ref = step.expertId
          ? { expertId: step.expertId }
          : { legacyAgentKey: (step.legacyAgentKey ?? 'general') as LegacyAgentKey }

        const stepInput = typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : JSON.stringify(ctx.lastOutput ?? '')

        let stepOutput: unknown
        try {
          const result = await runRegisteredExpert({
            ref,
            userContent: stepInput,
            maxToolRounds: AGENT_MAX_TOOL_ROUNDS,
            isCancelled: () => isExecutionCancelled(ctx.executionId),
            generalPromptBuilder: () => '你是通用 AI 助手，请完成当前任务步骤。',
          })
          stepOutput = { text: result.text, expertId: result.expertId, legacyAgentKey: result.legacyAgentKey }
          step.status = 'done'
        } catch (err) {
          stepOutput = { error: err instanceof Error ? err.message : String(err) }
          step.status = 'failed'
        }

        ctx.lastOutput = stepOutput
        ctx.nodeOutputs[step.id] = stepOutput
        executionCount++

        emitWorkflowNodeEvent(ctx.executionId, 'task_step_complete', {
          nodeId: node.id,
          stepId: step.id,
          stepIndex: currentStepIndex,
          status: step.status,
          output: stepOutput,
        })

        if (step.status === 'failed') {
          return {
            output: {
              steps,
              currentStepIndex,
              executionCount,
              failedStepId: step.id,
              error: (stepOutput as Record<string, unknown>)?.error,
            },
            error: `task-chain: 步骤「${step.description}」执行失败`,
          }
        }

        currentStepIndex++
      }

      return {
        output: {
          steps,
          currentStepIndex,
          executionCount,
          completed: true,
        },
      }
    }

    case 'collaboration-router': {
      const toolResults = data.toolResults
        ?? (Array.isArray(ctx.lastOutput) ? ctx.lastOutput as Array<{ toolName: string; output: unknown }> : [])
      const currentExpertId = data.expertId
        ?? (typeof ctx.lastOutput === 'object' && ctx.lastOutput !== null
          ? (ctx.lastOutput as Record<string, unknown>).expertId as string ?? 'unknown'
          : 'unknown')

      const routeResult = routeCollaboration({
        toolResults,
        currentExpertId,
        taskChain: data.taskChain,
        collaborationHistory: data.collaborationHistory,
        maxCollaborationRounds: data.maxCollaborationRounds,
      })

      emitWorkflowNodeEvent(ctx.executionId, 'collaboration_routed', {
        nodeId: node.id,
        next: routeResult.next,
        targetExpertId: routeResult.targetExpertId,
        collaborationRequest: routeResult.collaborationRequest,
      })

      if (routeResult.next === 'expert' && routeResult.targetExpertId) {
        const agentInput = typeof ctx.lastOutput === 'string'
          ? ctx.lastOutput
          : JSON.stringify(ctx.lastOutput ?? '')
        const result = await dispatchAgent(routeResult.targetExpertId, agentInput, ctx)
        return {
          output: {
            ...routeResult,
            expertOutput: result.output,
          },
        }
      }

      return { output: routeResult }
    }

    default:
      return { output: ctx.lastOutput }
  }
}

export async function executeAgentWorkflow(params: ExecuteParams): Promise<void> {
  const { executionId, graph, input, resumeFromWaiting } = params
  const executionDoc = leanDoc<{
    triggeredBy?: unknown
    tenantId?: string
    workflowId?: unknown
    workflowName?: string
  }>(
    await AgentWorkflowExecutionModel.findById(executionId).lean(),
  )
  const triggeredBy = String(executionDoc?.triggeredBy ?? '')
  const metricBase = {
    tenantId: executionDoc?.tenantId ?? '000000',
    workflowId: String(executionDoc?.workflowId ?? ''),
    workflowName: executionDoc?.workflowName ?? '',
    executionId,
  }
  const conversationHistory = resumeFromWaiting
    ? await loadExecutionConversation(executionId)
    : await initExecutionConversation(executionId, input)

  const ctx: RuntimeContext = {
    executionId,
    triggeredBy,
    input,
    lastOutput: input,
    nodeOutputs: {},
    conversationHistory,
  }

  let currentId: string | null = graph.entryNodeId
  const visited = new Set<string>()

  if (resumeFromWaiting) {
    const execution = await AgentWorkflowExecutionModel.findById(executionId)
    const waitingRecord = execution?.nodeRecords
      ?.slice()
      .reverse()
      .find((r: { status?: string }) => r.status === 'waiting')
    if (!waitingRecord?.nodeId) {
      await finishExecution(executionId, 'error', '没有可恢复的等待节点')
      return
    }
    const waitNodeId = waitingRecord.nodeId as string

    // 人工确认：approved === false 表示拒绝，终止执行
    const resumeInput = input as Record<string, unknown>
    if (resumeInput?.approved === false) {
      const reason = (resumeInput.comment as string) ?? '人工拒绝'
      await updateNodeRecord(executionId, waitNodeId, {
        status: 'error',
        output: resumeInput,
        error: reason,
      })
      await finishExecution(executionId, 'cancelled', reason)
      return
    }

    for (const rec of execution?.nodeRecords ?? []) {
      if (rec.status === 'success' && rec.nodeId && rec.output != null) {
        ctx.nodeOutputs[rec.nodeId as string] = rec.output
      }
    }
    ctx.conversationHistory = await loadExecutionConversation(executionId)
    ctx.lastOutput = input
    ctx.nodeOutputs[waitNodeId] = input
    await updateNodeRecord(executionId, waitNodeId, {
      status: 'success',
      output: input,
    })
    await AgentWorkflowExecutionModel.updateOne(
      { _id: executionId },
      { $set: { status: 'running', finishedAt: null, durationMs: null, error: null } },
    )
    currentId = pickNextNode(graph, waitNodeId)
    if (!currentId) {
      await finishExecution(executionId, 'success')
      return
    }
  }

  while (currentId) {
    if (await stopExecutionIfCancelled(executionId)) {
      return
    }

    if (visited.has(currentId)) {
      await finishExecution(executionId, 'error', `检测到循环：节点 ${currentId}`)
      return
    }
    visited.add(currentId)

    const node = getNode(graph, currentId)
    if (!node) {
      await finishExecution(executionId, 'error', `节点不存在：${currentId}`)
      return
    }

    const startedAt = new Date()
    const nodeName = node.data?.label ?? node.id

    await appendNodeRecord(executionId, {
      nodeId: node.id,
      nodeType: node.type,
      nodeName,
      status: 'running',
      startedAt,
      input: { lastOutput: ctx.lastOutput, input: ctx.input },
    })

    try {
      const result = await runNode(node, ctx)
      if (await stopExecutionIfCancelled(executionId, node.id)) {
        return
      }
      const finishedAt = new Date()
      const durationMs = finishedAt.getTime() - startedAt.getTime()

      if (result.wait) {
        await updateNodeRecord(executionId, node.id, {
          status: 'waiting',
          finishedAt,
          durationMs,
          output: result.output,
        })
        await finishExecution(executionId, 'waiting')
        return
      }

      const nodeError = resolveNodeError(result)
      if (nodeError) {
        await updateNodeRecord(executionId, node.id, {
          status: 'error',
          finishedAt,
          durationMs,
          output: result.output,
          error: nodeError,
        })
        void recordNodeMetric({
          ...metricBase,
          nodeId: node.id,
          nodeType: node.type,
          nodeName,
          duration: durationMs,
          success: false,
          error: nodeError,
        })
        await finishExecution(executionId, 'error', nodeError)
        return
      }

      ctx.lastOutput = result.output
      ctx.nodeOutputs[node.id] = result.output

      await updateNodeRecord(executionId, node.id, {
        status: 'success',
        finishedAt,
        durationMs,
        output: result.output,
      })
      void recordNodeMetric({
        ...metricBase,
        nodeId: node.id,
        nodeType: node.type,
        nodeName,
        duration: durationMs,
        success: true,
      })

      if (node.type === 'end') {
        await finishExecution(executionId, 'success')
        return
      }

      currentId = pickNextNode(graph, node.id, result.branch)
      if (!currentId) {
        await finishExecution(executionId, 'success')
        return
      }
    } catch (err) {
      const finishedAt = new Date()
      const errorMessage = err instanceof Error ? err.message : String(err)
      const cancelled = errorMessage === '用户手动停止'
        || await isExecutionCancelled(executionId)
      logger.error({ msg: '[agentWorkflow] node error', nodeId: node.id, err })
      const catchDuration = finishedAt.getTime() - startedAt.getTime()
      await updateNodeRecord(executionId, node.id, {
        status: cancelled ? 'skipped' : 'error',
        finishedAt,
        durationMs: catchDuration,
        error: errorMessage,
      })
      void recordNodeMetric({
        ...metricBase,
        nodeId: node.id,
        nodeType: node.type,
        nodeName,
        duration: catchDuration,
        success: false,
        error: errorMessage,
      })
      await finishExecution(executionId, cancelled ? 'cancelled' : 'error', errorMessage)
      return
    }
  }

  await finishExecution(executionId, 'success')
}

/**
 * Shared agent infrastructure.
 *
 * Utility functions used across the AI agent system:
 * - Model configuration per task type
 * - Message building for direct LLM calls (schemaGenerator)
 * - Structured output parsing (think/answer/tip/schema tags)
 * - Retry with exponential backoff
 * - Regex safety
 *
 * Note: LangGraph handles the main agent loop, tool execution,
 * and streaming. These utilities are retained for schemaGenerator.ts
 * and tool implementations.
 *
 * All LLM calls MUST go through getLLM() from services/llmCache.ts.
 * Do NOT create OpenAI clients directly — use the provider abstraction layer.
 */

import OpenAI from 'openai'
import {
  HISTORY_TOKEN_BUDGET,
  LANGGRAPH_HISTORY_TOKEN_BUDGET,
  MIN_KEEP_MESSAGES,
  MAX_ASSISTANT_CONTENT_CHARS,
  LLM_MAX_RETRIES,
  LLM_RETRY_BASE_DELAY_MS,
  LLM_STREAM_MAX_RETRIES,
} from '../config.js'

// ────────────────────────────────────────────
// Model configuration per task type
// ────────────────────────────────────────────

export type TaskType = 'router' | 'generate_simple' | 'generate_complex' | 'analyze'

/**
 * Select model by task type.
 *
 * Resolution order:
 * 1. Env var override: LLM_MODEL_ROUTER, LLM_MODEL_GENERATE_SIMPLE, etc.
 * 2. DB Model table: the tenant's default model (isDefault=true)
 * 3. LLMManager env-registered provider's defaultModel
 * 4. Empty string (getLLM() will handle the final fallback)
 *
 * Task-specific model selection (e.g., fast model for router, powerful for complex)
 * should be configured via DB Model records with task annotations, not hardcoded.
 */
export function getModelForTask(taskType: TaskType): string {
  // Allow env var overrides for each task type
  const envModel = process.env[`LLM_MODEL_${taskType.toUpperCase()}`]
  if (envModel) return envModel

  // No hardcoded provider→model mapping — getLLM() resolves from DB/env
  return ''
}

/**
 * Get all active model identifiers from DB.
 * Used for type inference in frontend compatibility.
 * Returns empty array if DB is not available.
 */
export async function getActiveModelIdentifiers(): Promise<string[]> {
  try {
    const { ModelModel } = await import('../../models/Model.js')
    const models = await ModelModel.find({ isActive: true }).select('model').lean() as Record<string, unknown>[]
    return models.map((m) => m.model as string).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 从 LLM 响应中提取 JSON 对象。
 *
 * 优先匹配 ```json ... ``` 代码块，降级匹配第一个完整 JSON 对象（非贪婪）。
 * 用于 requirementAnalyzer / taskPlanner 等需要解析 LLM JSON 输出的节点，
 * 加固对代码块包裹和混杂文本的容错。
 */
export function extractJsonFromResponse(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null

  // 优先匹配 ```json ... ``` 代码块
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* fallthrough */ }
  }

  // 降级：匹配第一个完整 JSON 对象（平衡花括号，非贪婪）
  const start = raw.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"' && !escape) { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1)
        try {
          const parsed = JSON.parse(candidate)
          if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
        } catch { /* keep scanning */ }
        return null
      }
    }
  }

  return null
}

/**
 * Resolve the LLM model from user chat preferences.
 *
 * Accepts any non-empty model string from the user's preference.
 * Validation against DB models happens at getLLM() level — if the model
 * doesn't exist, getLLM() falls back to the tenant default.
 */
export function resolveUserModel(
  preferences: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const model = preferences?.llmModel
  if (typeof model === 'string' && model.trim()) {
    return model.trim()
  }
  return fallback
}

/** 将用户偏好格式化为提示词片段（排除 llmModel 等系统字段） */
export function formatPreferencesForPrompt(
  preferences: Record<string, unknown> | undefined,
): string | null {
  if (!preferences) return null

  const lines = Object.entries(preferences)
    .filter(([key]) => key !== 'llmModel')
    .map(([key, value]) => `- ${key}: ${value}`)

  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Classify task complexity from user message using heuristic rules.
 * Keywords are configurable via DB (system_config_complex_indicators).
 */
export async function classifyTaskComplexity(message: string): Promise<TaskType> {
  const { getComplexIndicators } = await import('../services/systemConfig.js')
  const indicators = await getComplexIndicators()

  const matchCount = indicators.filter((kw) => message.includes(kw)).length
  if (matchCount >= 2) return 'generate_complex'
  return 'generate_simple'
}

// ────────────────────────────────────────────
// Token estimation & dynamic truncation
// ────────────────────────────────────────────

/**
 * Estimate token count for a message.
 *
 * Uses a simple heuristic: ~1.5 tokens per Chinese character,
 * ~0.75 tokens per English word, plus overhead for JSON/structured content.
 * This is intentionally fast (no API call) and errs on the side of
 * over-counting to avoid context overflow.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // Count CJK characters (each ~1.5 tokens)
  const cjkCount = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length
  // Count non-CJK characters (rough: 4 chars ≈ 1 token)
  const nonCjkLength = text.length - cjkCount
  // Overhead for JSON structure (brackets, quotes, keys)
  const jsonOverhead = (text.match(/[{}[\]":,]/g) ?? []).length * 0.1
  return Math.ceil(cjkCount * 1.5 + nonCjkLength / 4 + jsonOverhead)
}

/**
 * Estimate token count for a LangGraph BaseMessage.
 * Handles string content, content arrays, and tool_calls arguments.
 */
export function estimateMessageTokens(message: { content?: unknown; tool_calls?: unknown[]; additional_kwargs?: unknown }): number {
  let tokens = 0

  // Content
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content)
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (typeof part === 'string') {
        tokens += estimateTokens(part)
      } else if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        tokens += estimateTokens((part as { text: string }).text)
      }
    }
  }

  // Tool calls (AIMessage with tool_calls)
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      const args = (tc as { args?: unknown }).args
      if (typeof args === 'string') {
        tokens += estimateTokens(args)
      } else if (args && typeof args === 'object') {
        tokens += estimateTokens(JSON.stringify(args))
      }
    }
  }

  // reasoning_content (DeepSeek chain-of-thought)
  const ak = message.additional_kwargs as Record<string, unknown> | undefined
  if (ak && typeof ak.reasoning_content === 'string') {
    tokens += estimateTokens(ak.reasoning_content)
  }

  // Base overhead per message (role, formatting, etc.)
  tokens += 4

  return tokens
}

// Token budgets imported from ../config.js

/**
 * Truncate conversation history based on token budget.
 *
 * Strategy:
 * 1. Always keep the first message (original user request) if possible
 * 2. Always keep the last MIN_KEEP_MESSAGES messages
 * 3. Fill the middle from newest to oldest until token budget is exhausted
 * 4. Never break a tool_calls → ToolMessage chain
 *
 * This replaces the fixed turn-count truncation to better handle
 * conversations with varying message lengths (tool results can be huge).
 */
export function truncateMessages<T extends { constructor: { name: string }; content?: unknown }>(
  messages: readonly T[],
  tokenBudget: number = HISTORY_TOKEN_BUDGET,
): T[] {
  const historyMessages = messages.slice(0, -1)

  if (historyMessages.length <= MIN_KEEP_MESSAGES) {
    return [...historyMessages]
  }

  // Estimate tokens per message
  const tokenCosts = historyMessages.map((m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    return estimateTokens(content)
  })

  // Always include the last MIN_KEEP_MESSAGES messages
  const alwaysIncludeStart = historyMessages.length - MIN_KEEP_MESSAGES
  let totalTokens = 0
  for (let i = alwaysIncludeStart; i < historyMessages.length; i++) {
    totalTokens += tokenCosts[i]
  }

  // Walk backwards from the "always include" boundary to fill budget
  let cutoffIndex = alwaysIncludeStart
  for (let i = alwaysIncludeStart - 1; i >= 0; i--) {
    if (totalTokens + tokenCosts[i] > tokenBudget) break
    totalTokens += tokenCosts[i]
    cutoffIndex = i
  }

  // Always try to include the first message (original user request)
  if (cutoffIndex > 0 && cutoffIndex <= 1) {
    cutoffIndex = 0
  }

  // Ensure cutoff doesn't break a tool_calls → ToolMessage chain
  cutoffIndex = findSafeCutoffPoint(historyMessages, cutoffIndex)

  return historyMessages.slice(cutoffIndex)
}

/**
 * Find a safe cutoff point that doesn't break tool_calls → ToolMessage chains.
 *
 * If the message at cutoffIndex is a ToolMessage, walk back to before
 * the corresponding AIMessage with tool_calls.
 * If the message before cutoffIndex is an AIMessage with tool_calls,
 * walk forward to include the ToolMessages.
 */
function findSafeCutoffPoint<T extends { constructor: { name: string } }>(
  messages: readonly T[],
  cutoffIndex: number,
): number {
  // Ensure we don't land in the middle of a tool chain
  while (cutoffIndex > 0 && cutoffIndex < messages.length) {
    const msg = messages[cutoffIndex]
    const prevMsg = messages[cutoffIndex - 1]

    // If previous message is AIMessage with tool_calls, current must be ToolMessage
    if (prevMsg.constructor.name === 'AIMessage' || prevMsg.constructor.name === 'AIMessageChunk') {
      const hasToolCalls = (prevMsg as unknown as { tool_calls?: unknown[] }).tool_calls?.length
      if (hasToolCalls && msg.constructor.name !== 'ToolMessage') {
        cutoffIndex--
        continue
      }
    }

    // If current message is ToolMessage, we're inside a tool chain — move back
    if (msg.constructor.name === 'ToolMessage') {
      cutoffIndex--
      continue
    }

    break
  }

  return cutoffIndex
}

/**
 * Find safe cutoff using instanceof checks (for LangGraph BaseMessage objects).
 *
 * This variant works with actual LangGraph message instances where
 * constructor.name may differ due to bundling/minification.
 */
function findSafeCutoffPointForLangGraph<T extends { constructor: Function }>(
  messages: readonly T[],
  cutoffIndex: number,
): number {
  // Lazily import to avoid circular deps at module level
  const isAiMessage = (m: T): boolean => {
    const name = m.constructor.name
    return name === 'AIMessage' || name === 'AIMessageChunk'
  }
  const hasToolCalls = (m: T): boolean => {
    const tc = (m as unknown as { tool_calls?: unknown[] }).tool_calls
    return Array.isArray(tc) && tc.length > 0
  }
  const isToolMessage = (m: T): boolean => m.constructor.name === 'ToolMessage'

  while (cutoffIndex > 0 && cutoffIndex < messages.length) {
    const msg = messages[cutoffIndex]
    const prevMsg = messages[cutoffIndex - 1]

    // If previous is AIMessage with tool_calls, current must be ToolMessage
    if (isAiMessage(prevMsg) && hasToolCalls(prevMsg) && !isToolMessage(msg)) {
      cutoffIndex--
      continue
    }

    // If current is ToolMessage, we're inside a tool chain — move back
    if (isToolMessage(msg)) {
      cutoffIndex--
      continue
    }

    break
  }

  return cutoffIndex
}

/**
 * Truncate messages for LangGraph agent nodes.
 *
 * Uses a larger token budget (60K) than the non-graph path since
 * DeepSeek v4-flash has 128K context. The strategy is:
 *
 * 1. If total tokens fit within budget, return all messages unchanged
 * 2. Always keep the last MIN_KEEP_MESSAGES messages (recent tool call results are critical)
 * 3. Keep the first HumanMessage (original user request) if possible
 * 4. Fill the middle from newest to oldest until budget is exhausted
 * 5. Never break a tool_calls -> ToolMessage chain
 * 6. If first message gets dropped, insert a summary placeholder
 *
 * @param messages - LangGraph state.messages (BaseMessage[])
 * @param tokenBudget - max tokens for history (default 60K)
 * @returns truncated message array (new array, does not mutate input)
 */
export function truncateMessagesForLangGraph<T extends { constructor: Function; content?: unknown; tool_calls?: unknown[]; additional_kwargs?: unknown }>(
  messages: readonly T[],
  tokenBudget: number = LANGGRAPH_HISTORY_TOKEN_BUDGET,
): T[] {
  if (messages.length <= MIN_KEEP_MESSAGES) {
    return [...messages]
  }

  // Fast path: estimate total tokens first
  let totalTokens = 0
  const tokenCosts: number[] = []
  for (const m of messages) {
    const cost = estimateMessageTokens(m)
    tokenCosts.push(cost)
    totalTokens += cost
  }

  // If within budget, return as-is
  if (totalTokens <= tokenBudget) {
    return [...messages]
  }

  console.log(`[truncateMessages] 触发截断: ${totalTokens} tokens > ${tokenBudget} budget, ${messages.length} messages`)

  // Strategy: keep last MIN_KEEP_MESSAGES + fill from newest to oldest
  const alwaysIncludeStart = messages.length - MIN_KEEP_MESSAGES
  let usedTokens = 0
  for (let i = alwaysIncludeStart; i < messages.length; i++) {
    usedTokens += tokenCosts[i]
  }

  // Walk backwards from alwaysIncludeStart to fill budget
  let cutoffIndex = alwaysIncludeStart
  for (let i = alwaysIncludeStart - 1; i >= 0; i--) {
    if (usedTokens + tokenCosts[i] > tokenBudget) break
    usedTokens += tokenCosts[i]
    cutoffIndex = i
  }

  // Always try to include the first message (original user request)
  if (cutoffIndex > 0 && cutoffIndex <= 1) {
    cutoffIndex = 0
  }

  // Ensure cutoff doesn't break a tool_calls → ToolMessage chain
  cutoffIndex = findSafeCutoffPointForLangGraph(messages, cutoffIndex)

  const truncated = messages.slice(cutoffIndex)

  console.log(`[truncateMessages] 截断完成: ${messages.length} -> ${truncated.length} messages, dropped ${cutoffIndex} from front`)

  return truncated
}

/**
 * Build LLM message array from conversation state.
 *
 * Used by schemaGenerator.ts for direct (non-graph) LLM calls.
 * LangGraph nodes handle message management via the graph state.
 *
 * Uses token-budget-based truncation instead of fixed turn count.
 */
export function buildMessages(
  state: { messages: Array<{ role: string; content: string }>; [key: string]: unknown },
  systemPrompt: string,
  buildUserMessage: (state: { messages: Array<{ role: string; content: string }>; [key: string]: unknown }) => string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  const historyMessages = state.messages.slice(0, -1)

  // Token-budget-based truncation
  const TOKEN_BUDGET = HISTORY_TOKEN_BUDGET
  let totalTokens = 0

  // Always include the last 4 messages (2 turns)
  const alwaysIncludeStart = Math.max(0, historyMessages.length - 4)
  for (let i = alwaysIncludeStart; i < historyMessages.length; i++) {
    const msg = historyMessages[i]
    if (msg.role === 'user' || msg.role === 'assistant') {
      totalTokens += estimateTokens(msg.content)
    }
  }

  // Find cutoff by walking backwards from alwaysIncludeStart
  let cutoffIndex = alwaysIncludeStart
  for (let i = alwaysIncludeStart - 1; i >= 0; i--) {
    const msg = historyMessages[i]
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    const cost = estimateTokens(msg.content)
    if (totalTokens + cost > TOKEN_BUDGET) break
    totalTokens += cost
    cutoffIndex = i
  }

  // Build the truncated history in original order
  const truncatedHistory = historyMessages.slice(cutoffIndex)

  for (const msg of truncatedHistory) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content })
    } else if (msg.role === 'assistant') {
      const content = msg.content.length > MAX_ASSISTANT_CONTENT_CHARS
        ? msg.content.slice(0, MAX_ASSISTANT_CONTENT_CHARS) + '...(已截断)'
        : msg.content
      messages.push({ role: 'assistant', content })
    }
  }

  messages.push({ role: 'user', content: buildUserMessage(state) })

  return messages
}

// ────────────────────────────────────────────
// Structured output parser
// ────────────────────────────────────────────

export interface ParsedStructuredOutput {
  thinking: string
  answer: string
  tip: string
  schemaRaw: string
  hasStructuredTags: boolean
}

export function parseStructuredOutput(raw: string): ParsedStructuredOutput {
  const extract = (tag: string): string => {
    const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`)
    const m = raw.match(re)
    return m ? m[1].trim() : ''
  }

  const thinking = extract('think')
  const answer = extract('answer')
  const tip = extract('tip')
  const schemaRaw = extract('schema')

  return {
    thinking,
    answer,
    tip,
    schemaRaw,
    hasStructuredTags: !!(thinking || answer || tip || schemaRaw),
  }
}

// ────────────────────────────────────────────
// Regex safety
// ────────────────────────────────────────────

/**
 * Escape special regex characters in a string for safe use in $regex queries.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ────────────────────────────────────────────
// Agent metrics
// ────────────────────────────────────────────

type AgentName = 'thinker' | 'editor' | 'flow' | 'page' | 'general' | 'summarizer' | 'router'
type Operation = 'invoke' | 'tool_call' | 'think' | 'stream'

/**
 * Execute a function with performance metrics recording.
 *
 * Records duration, success/failure, and optional token usage
 * to the AgentMetric collection.
 */
export async function executeWithMetrics<T>(
  agentName: AgentName,
  operation: Operation,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start

    // Extract token usage from LLM response if present
    const tokenUsage = extractTokenUsage(result)

    const { AgentMetricModel } = await import('../models/monitor.js')
    await AgentMetricModel.create({
      _id: (await import('uuid')).v4(),
      agentName,
      operation,
      duration,
      success: true,
      tokenUsage,
      metadata,
    })

    return result
  } catch (err) {
    const duration = Date.now() - start
    const error = err instanceof Error ? err.message : String(err)

    const { AgentMetricModel } = await import('../models/monitor.js')
    await AgentMetricModel.create({
      _id: (await import('uuid')).v4(),
      agentName,
      operation,
      duration,
      success: false,
      error,
      metadata,
    })

    throw err
  }
}

/**
 * Wrap an agent node function with metrics recording.
 *
 * Returns a new function with the same signature that records
 * execution metrics on every invocation.
 */
export function withAgentMetrics<TState, TResult>(
  agentName: AgentName,
  operation: Operation,
  nodeFn: (state: TState) => Promise<TResult>,
): (state: TState) => Promise<TResult> {
  return async (state: TState): Promise<TResult> => {
    return executeWithMetrics(agentName, operation, () => nodeFn(state))
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTokenUsage(result: any): { prompt?: number; completion?: number; total?: number } | undefined {
  if (!result || typeof result !== 'object') return undefined
  const usage = result.usage
  if (!usage || typeof usage !== 'object') return undefined
  return {
    prompt: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    completion: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    total: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
  }
}

// ────────────────────────────────────────────
// Retry with exponential backoff
// ────────────────────────────────────────────

// Retry constants imported from ../config.js

/**
 * Retry a function with exponential backoff for transient errors.
 * Only retries on network errors and 429/500/502/503/504 status codes.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = LLM_MAX_RETRIES,
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === maxRetries) break

      const status = (err as { status?: number }).status
      const isTransient = !status || [429, 500, 502, 503, 504].includes(status)
      if (!isTransient) break

      const delay = LLM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[withRetry] 重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

/**
 * 带重试的流式 LLM 调用包装器。
 *
 * 用于 Agent 节点的 model.stream() 调用，
 * 对 429/5xx 错误自动重试，400 参数错误不重试。
 */
export async function streamWithRetry<T>(
  agentName: string,
  fn: () => Promise<T>,
  maxRetries = LLM_STREAM_MAX_RETRIES,
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt === maxRetries) break

      const status = (err as { status?: number }).status
      // 400 不重试（参数错误），429/5xx 重试
      if (status && status < 500 && status !== 429) break

      const delay = LLM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[${agentName}] LLM 流式调用重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

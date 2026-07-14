/**
 * Summarizer — runtime pure function.
 *
 * 从 graph/graph.ts summarizerNode 抽取 prompt 构建和流式生成逻辑，
 * 不依赖 LangGraph State。供 graph node、workflow、API 等多入口复用。
 */

import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { logger } from '../../utils/logger.js'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface SummarizerInput {
  /** 各步骤的执行结果 */
  steps: Array<{ description: string; output: string; status: string }>
  /** 用户需求原文（用于上下文） */
  userMessage?: string
  /** 自定义 system prompt（替换默认） */
  customPrompt?: string
  /** 指定模型名称 */
  model?: string
}

/** 依赖注入 — 最小接口 */
export interface SummarizerContext {
  getLLM: (opts: {
    model?: string
    temperature?: number
    maxTokens?: number
  }) => Promise<{
    stream: (messages: unknown[]) => AsyncIterable<{
      content: string | unknown
    }>
  }>
}

// ────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────

const DEFAULT_SUMMARIZER_PROMPT = `你是 schema-platform 的 AI 助手。你的任务是对专家智能体的执行结果进行总结。

请以助手身份回答，简洁明了，突出重点，给出后续建议。`

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function formatStepResults(steps: SummarizerInput['steps']): string {
  if (steps.length === 0) return '无'

  return steps
    .map((step) => {
      const icon = step.status === 'done' ? '[完成]' : step.status === 'failed' ? '[失败]' : '[跳过]'
      return `${icon} ${step.description}\n${step.output}`
    })
    .join('\n\n')
}

function buildSummaryPrompt(input: SummarizerInput): string {
  const systemPrompt = input.customPrompt ?? DEFAULT_SUMMARIZER_PROMPT
  const taskResults = formatStepResults(input.steps)

  return `${systemPrompt}

## 用户需求
${input.userMessage ?? '未提供'}

## 执行结果
${taskResults}

请以助手身份总结执行结果，并给出后续建议。`
}

function buildFallbackContent(steps: SummarizerInput['steps']): string {
  const taskResults = steps
    .filter((s) => s.status === 'done')
    .map((s) => `- ${s.description}`)
    .join('\n')

  return `## 执行完成\n\n${taskResults || '无执行结果'}\n\n如需进一步调整，请继续描述需求。`
}

// ────────────────────────────────────────────
// Core
// ────────────────────────────────────────────

/**
 * 纯函数（流式）：根据各步骤执行结果生成总结。
 *
 * 与 graph/graph.ts summarizerNode 的区别：
 * - 不依赖 LangGraph State / Annotation
 * - getLLM 通过 context 注入
 * - 返回 AsyncGenerator<string>，逐 chunk 产出
 *
 * 使用示例：
 * ```ts
 * for await (const chunk of generateSummary(input, ctx)) {
 *   process.stdout.write(chunk)
 * }
 * ```
 */
export async function* generateSummary(
  input: SummarizerInput,
  context: SummarizerContext,
): AsyncGenerator<string> {
  const { model, steps } = input

  logger.info({
    msg: '[summarizer:runtime] Generating summary',
    stepCount: steps.length,
    doneCount: steps.filter((s) => s.status === 'done').length,
  })

  const prompt = buildSummaryPrompt(input)
  const userContent = input.userMessage ?? '请总结执行结果'

  try {
    const llm = await context.getLLM({
      model,
      temperature: 0.7,
      maxTokens: 2048,
    })

    const stream = await llm.stream([
      new SystemMessage(prompt),
      new HumanMessage(userContent),
    ])

    for await (const chunk of stream) {
      const content = typeof chunk.content === 'string' ? chunk.content : ''
      if (content) yield content
    }
  } catch (err) {
    logger.error({ msg: '[summarizer:runtime] LLM call failed, returning fallback', error: err })
    yield buildFallbackContent(steps)
  }
}

/**
 * 非流式变体：一次性返回完整总结。
 *
 * 适用于不需要流式输出的场景（workflow、API 响应等）。
 */
export async function generateSummaryText(
  input: SummarizerInput,
  context: SummarizerContext,
): Promise<string> {
  let content = ''
  for await (const chunk of generateSummary(input, context)) {
    content += chunk
  }
  return content
}

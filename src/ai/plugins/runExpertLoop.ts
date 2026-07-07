/**
 * 通用 Expert ReAct 循环 — Chat LangGraph 与 Workflow 共用。
 */

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { StructuredTool } from '@langchain/core/tools'
import { getLLM } from '../services/llmCache.js'

export interface RunExpertLoopParams {
  systemPrompt: string
  userContent: string
  tools: StructuredTool[]
  maxToolRounds?: number
  temperature?: number
  maxTokens?: number
  model?: string
  isCancelled?: () => Promise<boolean>
}

export interface RunExpertLoopResult {
  text: string
  truncated: boolean
}

const DEFAULT_MAX_TOOL_ROUNDS = 3

export async function runExpertLoop(params: RunExpertLoopParams): Promise<RunExpertLoopResult> {
  const maxRounds = params.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS
  const llm = await getLLM({
    temperature: params.temperature ?? 0.5,
    maxTokens: params.maxTokens ?? 4096,
    model: params.model,
  })
  const boundLLM = params.tools.length > 0 ? llm.bindTools(params.tools) : llm

  const messages: BaseMessage[] = [
    new SystemMessage(params.systemPrompt),
    new HumanMessage(params.userContent),
  ]

  for (let round = 0; round < maxRounds; round++) {
    if (params.isCancelled && await params.isCancelled()) {
      throw new Error('用户手动停止')
    }

    const response = await boundLLM.invoke(messages)
    const aiMsg = response as AIMessage
    messages.push(aiMsg)

    const toolCalls = (aiMsg as unknown as {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>
    }).tool_calls

    if (!toolCalls?.length) {
      const content = typeof aiMsg.content === 'string'
        ? aiMsg.content
        : JSON.stringify(aiMsg.content)
      return { text: content, truncated: false }
    }

    for (const tc of toolCalls) {
      const matched = params.tools.find((t) => t.name === tc.name)
      if (matched) {
        try {
          const result = await matched.invoke(tc.args)
          messages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id }))
        } catch (err) {
          messages.push(new ToolMessage({
            content: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
            tool_call_id: tc.id,
          }))
        }
      } else {
        messages.push(new ToolMessage({
          content: `工具 ${tc.name} 未找到`,
          tool_call_id: tc.id,
        }))
      }
    }
  }

  const lastMsg = messages[messages.length - 1]
  const rawContent = lastMsg ? (lastMsg as AIMessage).content : undefined
  const content = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent
          .map((part) => (typeof part === 'string' ? part : (part as { text?: string }).text ?? ''))
          .join('')
      : 'Agent 达到最大工具调用轮次'
  return { text: content || 'Agent 达到最大工具调用轮次', truncated: true }
}

/**
 * 插件中心专家节点 — 按 session.currentExpertId 执行任意注册 Expert。
 */

import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getLLM } from '../services/llmCache.js'
import { getPluginRegistry } from '../plugins/index.js'
import { buildExpertSystemPrompt, getExpertTools } from '../plugins/dispatchExpert.js'
import {
  truncateMessagesForLangGraph,
  resolveUserModel,
  getModelForTask,
  type TaskType,
} from './agentBase.js'
import { callLLMWithFallback } from './agentErrorHandler.js'
import { retrieveRagContext } from './ragContextRetriever.js'
import type { AgentStateAnnotation } from './state.js'

export async function pluginExpertAgentNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const expertId = state.session.currentExpertId?.trim()
  if (!expertId) {
    throw new Error('[pluginExpert] missing session.currentExpertId')
  }

  const expert = getPluginRegistry().getExpert(expertId)
  if (!expert) {
    throw new Error(`[pluginExpert] unknown expert: ${expertId}`)
  }

  console.log(`[pluginExpert] start expert=${expertId}, messages=${state.messages.length}`)

  const lastUserMsg = [...state.messages].reverse().find((m) => m.constructor.name === 'HumanMessage')
  const userQueryText = lastUserMsg
    ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
    : ''
  const ragContext = await retrieveRagContext(userQueryText)

  const systemPrompt = await buildExpertSystemPrompt(expert)
  const tools = getExpertTools(expert)
  const taskName = (expert.model?.task ?? 'generate_complex') as TaskType

  const model = (await getLLM({
    model: resolveUserModel(state.interaction.preferences, getModelForTask(taskName)),
    temperature: expert.model?.temperature ?? 0.7,
    maxTokens: expert.model?.maxTokens ?? 8192,
  })).bindTools(tools)

  const truncatedHistory = truncateMessagesForLangGraph(state.messages)
  const messages = [
    new SystemMessage(systemPrompt),
    ...truncatedHistory,
    new HumanMessage(userQueryText + ragContext.context),
  ]

  return callLLMWithFallback('pluginExpert', async () => {
    const stream = await model.stream(messages)
    let final: AIMessageChunk | null = null
    for await (const chunk of stream) {
      final = final ? final.concat(chunk) : chunk
    }
    if (!final) throw new Error('LLM 返回空流')
    const response = final as unknown as AIMessage
    return { messages: [response] }
  })
}

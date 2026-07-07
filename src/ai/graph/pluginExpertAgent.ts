/**
 * 插件中心专家节点 — LangGraph 唯一专家执行入口。
 */

import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getLLM } from '../services/llmCache.js'
import { buildExpertSystemPrompt, getExpertTools } from '../plugins/dispatchExpert.js'
import {
  truncateMessagesForLangGraph,
  resolveUserModel,
  getModelForTask,
  type TaskType,
} from './agentBase.js'
import { callLLMWithFallback } from './agentErrorHandler.js'
import { retrieveRagContext } from './ragContextRetriever.js'
import { buildExpertUserContent } from './expertUserContext.js'
import { resolveExpertForSession } from './resolveGraphExpert.js'
import type { AgentStateAnnotation } from './state.js'

export async function pluginExpertAgentNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const expert = resolveExpertForSession(state.session)
  if (!expert) {
    throw new Error(
      `[pluginExpert] no expert for session agent=${state.session.currentAgent} expertId=${state.session.currentExpertId ?? ''}`,
    )
  }

  console.log(`[pluginExpert] start expert=${expert.id}, messages=${state.messages.length}`)

  const lastUserMsg = [...state.messages].reverse().find((m) => m.constructor.name === 'HumanMessage')
  const userQueryText = lastUserMsg
    ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
    : ''

  const ragContext = await retrieveRagContext(userQueryText)
  const systemPrompt = await buildExpertSystemPrompt(expert)
  const tools = getExpertTools(expert)
  const taskName = (expert.model?.task ?? 'generate_complex') as TaskType

  const llm = await getLLM({
    model: resolveUserModel(state.interaction.preferences, getModelForTask(taskName)),
    temperature: expert.model?.temperature ?? 0.7,
    maxTokens: expert.model?.maxTokens ?? 8192,
  })

  const model = tools.length > 0 ? llm.bindTools(tools) : llm
  const truncatedHistory = truncateMessagesForLangGraph(state.messages)
  const userContent = buildExpertUserContent(state, expert) + ragContext.context

  const messages = [
    new SystemMessage(systemPrompt),
    ...truncatedHistory,
    new HumanMessage(userContent),
  ]

  return callLLMWithFallback('pluginExpert', async () => {
    const stream = await model.stream(messages)
    let final: AIMessageChunk | null = null
    for await (const chunk of stream) {
      final = final ? final.concat(chunk) : chunk
    }
    if (!final) throw new Error('LLM 返回空流')
    const response = final as unknown as AIMessage
    return {
      messages: [response],
      session: {
        ...state.session,
        currentExpertId: expert.id,
        currentAgent: (expert.legacyAgentKey ?? state.session.currentAgent) as typeof state.session.currentAgent,
      },
    }
  })
}

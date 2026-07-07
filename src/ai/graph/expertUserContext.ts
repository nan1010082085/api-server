/**
 * LangGraph 专家用户上下文 — 按 legacyAgentKey 注入 Schema / Flow / 协作上下文。
 */

import { formatPreferencesForPrompt } from './agentBase.js'
import { buildContextInjection, type AgentContextPayload } from './contextCarrier.js'
import type { AgentStateAnnotation } from './state.js'
import type { ExpertDeclaration, LegacyAgentKey } from '../plugins/types.js'

function lastUserText(state: typeof AgentStateAnnotation.State): string {
  const lastHumanMessage = [...state.messages]
    .reverse()
    .find((m) => m.constructor.name === 'HumanMessage')

  if (!lastHumanMessage) {
    throw new Error('No user message found in state.')
  }

  return typeof lastHumanMessage.content === 'string'
    ? lastHumanMessage.content
    : JSON.stringify(lastHumanMessage.content)
}

function appendCollaborationContext(
  prompt: string,
  state: typeof AgentStateAnnotation.State,
): string {
  const currentStep = state.task.chain[state.task.currentStepIndex]
  if (!currentStep?.context || Object.keys(currentStep.context).length === 0) {
    return prompt
  }

  const ctx = currentStep.context as unknown as AgentContextPayload
  if (ctx.sourceAgent && ctx.summary) {
    return prompt + buildContextInjection(ctx)
  }

  return `${prompt}\n\n--- 协作上下文（来自其他专家的信息）---\n${JSON.stringify(currentStep.context, null, 2)}`
}

function appendSchemaContext(prompt: string, state: typeof AgentStateAnnotation.State): string {
  if (!state.context.currentSchema?.length) return prompt

  const widgets = state.context.currentSchema
  const widgetTypes = widgets.map((w) => w.type).join(', ')
  const widgetCount = widgets.length
  let next = `${prompt}\n\n--- 当前 Schema 概要 ---\n共 ${widgetCount} 个组件：${widgetTypes}`

  const structureLines: string[] = []
  const extractStructure = (w: Record<string, unknown>, indent = 0) => {
    const prefix = '  '.repeat(indent)
    const field = (w.field as string) ?? ''
    const label = (w.label as string) ?? ''
    const type = (w.type as string) ?? ''
    const id = (w.id as string) ?? ''
    let line = `${prefix}- [${type}] id=${id}`
    if (field) line += ` field="${field}"`
    if (label) line += ` label="${label}"`
    structureLines.push(line)
    const children = w.children as Array<Record<string, unknown>> | undefined
    if (children) {
      for (const child of children) extractStructure(child, indent + 1)
    }
  }
  for (const w of widgets) extractStructure(w)
  next += `\n\n--- 当前 Schema 结构 ---\n${structureLines.join('\n')}\n\n【重要】基于以上结构修改，请使用 update_schema 工具。`
  return next
}

function appendCommonTurnContext(prompt: string, state: typeof AgentStateAnnotation.State): string {
  let next = prompt

  if (state.interaction.historySummary) {
    next += `\n\n--- 前文摘要 ---\n${state.interaction.historySummary}`
  }

  const prefs = formatPreferencesForPrompt(state.interaction.preferences)
  if (prefs) {
    next += `\n\n--- 用户偏好 ---\n${prefs}`
  }

  if (state.context.turnCount > 1) {
    next += `\n\n这是第 ${state.context.turnCount} 轮对话，请基于之前的对话上下文理解和修改。`
  }

  return next
}

function buildSchemaExpertUserContent(state: typeof AgentStateAnnotation.State): string {
  let prompt = appendSchemaContext(lastUserText(state), state)
  prompt = appendCommonTurnContext(prompt, state)

  if (state.context.turnCount > 1 && state.context.currentSchema?.length) {
    prompt += '\n\n【重要】当前已有 Schema，用户可能要求修改。请使用 update_schema 工具提交修改结果，而不是 schema__validate_widgets。'
    prompt += '\n修改时请保持未变更部分不变，只修改用户要求变更的部分。在 description 字段中简要说明本次修改内容。'
  }

  return appendCollaborationContext(prompt, state)
}

function buildFlowExpertUserContent(state: typeof AgentStateAnnotation.State): string {
  let prompt = lastUserText(state)

  if (state.context.currentFlow && state.context.currentFlow.nodes.length > 0) {
    const flow = state.context.currentFlow
    const nodeCount = flow.nodes.length
    const edgeCount = flow.edges.length
    const nodeTypes = flow.nodes.map((n) => (n.data as Record<string, unknown>)?.bpmnType ?? n.type).join(', ')
    prompt += `\n\n--- 当前流程概要 ---\n共 ${nodeCount} 个节点，${edgeCount} 条连线：${nodeTypes}`

    const detailLines: string[] = []
    for (const node of flow.nodes) {
      const data = (node.data ?? {}) as Record<string, unknown>
      const bpmnType = (data.bpmnType as string) ?? 'unknown'
      const label = (data.label as string) ?? ''
      const id = (node.id as string) ?? ''
      detailLines.push(`  - [${bpmnType}] id="${id}" label="${label}"`)
    }
    const edgeLines: string[] = []
    for (const edge of flow.edges) {
      const src = (edge.source as Record<string, unknown>)?.cell as string ?? ''
      const tgt = (edge.target as Record<string, unknown>)?.cell as string ?? ''
      const data = (edge.data ?? {}) as Record<string, unknown>
      const label = (data.label as string) ?? ''
      edgeLines.push(`  - ${src} → ${tgt}${label ? ` (${label})` : ''}`)
    }
    prompt += `\n\n--- 当前流程节点 ---\n${detailLines.join('\n')}`
    prompt += `\n\n--- 当前流程连线 ---\n${edgeLines.join('\n')}`
    prompt += '\n\n【重要】基于以上结构修改，请使用 update_flow 工具。'
  }

  if (state.context.currentSchema?.length) {
    const widgetTypes = state.context.currentSchema.map((w) => w.type).join(', ')
    const widgetCount = state.context.currentSchema.length
    prompt += `\n\n--- 当前 Schema 概要 ---\n共 ${widgetCount} 个组件：${widgetTypes}`
  }

  prompt = appendCommonTurnContext(prompt, state)

  if (state.context.turnCount > 1 && state.context.currentFlow?.nodes.length) {
    prompt += '\n\n【重要】当前已有流程，用户可能要求修改。请使用 update_flow 工具提交修改结果，而不是 flow__validate。'
    prompt += '\n修改时请保持未变更部分不变，只修改用户要求变更的部分。在 description 字段中简要说明本次修改内容。'
  }

  return appendCollaborationContext(prompt, state)
}

export function buildExpertUserContent(
  state: typeof AgentStateAnnotation.State,
  expert: ExpertDeclaration,
): string {
  const key = expert.legacyAgentKey as LegacyAgentKey | undefined

  switch (key) {
    case 'flow':
      return buildFlowExpertUserContent(state)
    case 'editor':
    case 'page':
      return buildSchemaExpertUserContent(state)
    case 'general':
    default:
      return appendCollaborationContext(lastUserText(state), state)
  }
}

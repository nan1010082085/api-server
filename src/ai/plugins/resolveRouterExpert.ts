/**
 * LangGraph 意图路由 — 从插件中心解析专家，替代硬编码关键词表。
 */

import { getPluginRegistry } from './index.js'
import type { ExpertDeclaration, LegacyAgentKey } from './types.js'

export function expertToLegacyAgentKey(expert: ExpertDeclaration): LegacyAgentKey | null {
  return expert.legacyAgentKey ?? null
}

export function resolveRoutedExpert(input: {
  text: string
  contextSource?: string
}): ExpertDeclaration | null {
  const matched = getPluginRegistry().matchExpertsByRouting({
    text: input.text,
    contextSource: input.contextSource,
    runtime: 'langgraph',
  })
  return matched[0] ?? null
}

/** 供 taskPlanner 等节点：动态生成 Agent 能力说明 */
export function buildExpertCatalogForPrompt(): string {
  const lines = getPluginRegistry()
    .listExperts({ runtime: 'langgraph' })
    .map((e) => {
      const key = e.legacyAgentKey ?? e.id
      const desc = e.description?.trim() || e.label
      const tools = e.tools.slice(0, 6).join(', ')
      return `- **${key}** (${e.id}): ${desc}${tools ? `；工具示例: ${tools}` : ''}`
    })
  return lines.length ? lines.join('\n') : '- **editor**: 表单 Schema\n- **flow**: BPMN 流程\n- **page**: 页面布局'
}

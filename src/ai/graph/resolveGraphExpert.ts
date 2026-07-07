/**
 * LangGraph 会话专家解析 — 统一走插件 Registry + pluginExpert 节点。
 */

import { getPluginRegistry } from '../plugins/index.js'
import type { ExpertDeclaration, LegacyAgentKey } from '../plugins/types.js'
import type { ActiveAgent } from './state.js'

const LEGACY_AGENTS = new Set<LegacyAgentKey>(['editor', 'flow', 'page', 'general'])

export function isLegacyAgentKey(value: string): value is LegacyAgentKey {
  return LEGACY_AGENTS.has(value as LegacyAgentKey)
}

export function resolveExpertForSession(input: {
  currentExpertId?: string
  currentAgent: ActiveAgent | string
}): ExpertDeclaration | undefined {
  const registry = getPluginRegistry()
  const expertId = input.currentExpertId?.trim()
  if (expertId) {
    const byId = registry.getExpert(expertId)
    if (byId) return byId
  }

  const agent = input.currentAgent
  if (typeof agent === 'string' && isLegacyAgentKey(agent)) {
    return registry.getExpertByLegacyKey(agent)
  }

  return undefined
}

/** 将 legacy agent 键或已有 expertId 同步到 session（taskChain / router 共用） */
export function sessionForAgent<T extends {
  currentAgent: ActiveAgent | string
  currentExpertId?: string
}>(
  session: T,
  agent: ActiveAgent | string,
  expertId?: string,
): T {
  if (expertId?.trim()) {
    const expert = getPluginRegistry().getExpert(expertId.trim())
    return {
      ...session,
      currentExpertId: expertId.trim(),
      currentAgent: (expert?.legacyAgentKey ?? agent) as ActiveAgent,
    }
  }

  if (typeof agent === 'string' && isLegacyAgentKey(agent)) {
    const expert = getPluginRegistry().getExpertByLegacyKey(agent)
    if (expert) {
      return {
        ...session,
        currentAgent: agent,
        currentExpertId: expert.id,
      }
    }
  }

  return {
    ...session,
    currentAgent: agent as ActiveAgent,
    currentExpertId: undefined,
  }
}

/**
 * 统一 Expert 调度 — Workflow 与 LangGraph 共用 Registry 解析 prompt / tools。
 */

import type { StructuredTool } from '@langchain/core/tools'
import { createRequire } from 'module'
import { getPluginRegistry, resolveExpertSystemPrompt } from './index.js'
import { runExpertLoop } from './runExpertLoop.js'
import type { ExpertDeclaration, LegacyAgentKey } from './types.js'

const require = createRequire(import.meta.url)

let getToolsByNamesFn: ((names: string[]) => StructuredTool[]) | undefined

function resolveToolsByNames(names: string[]): StructuredTool[] {
  if (!getToolsByNamesFn) {
    getToolsByNamesFn = require('../tools/registry.js').getToolsByNames
  }
  return getToolsByNamesFn!(names)
}

export interface ExpertRef {
  expertId?: string
  legacyAgentKey?: LegacyAgentKey | string
}

export function resolveExpertRef(ref: ExpertRef): ExpertDeclaration | undefined {
  const registry = getPluginRegistry()
  if (ref.expertId?.trim()) {
    return registry.getExpert(ref.expertId.trim())
  }
  const legacy = ref.legacyAgentKey?.trim()
  if (legacy) {
    return registry.getExpertByLegacyKey(legacy as LegacyAgentKey)
  }
  return undefined
}

export async function buildExpertSystemPrompt(
  expert: ExpertDeclaration,
  opts: { generalPromptBuilder?: () => string } = {},
): Promise<string> {
  return resolveExpertSystemPrompt(expert, getPluginRegistry(), opts)
}

export function getExpertTools(expert: ExpertDeclaration): StructuredTool[] {
  const toolNames = getPluginRegistry().resolveExpertToolNames(expert.id)
  return resolveToolsByNames(toolNames)
}

export interface RunRegisteredExpertParams {
  ref: ExpertRef
  userContent: string
  maxToolRounds?: number
  temperature?: number
  maxTokens?: number
  model?: string
  isCancelled?: () => Promise<boolean>
  generalPromptBuilder?: () => string
}

export async function runRegisteredExpert(params: RunRegisteredExpertParams) {
  const expert = resolveExpertRef(params.ref)
  if (!expert) {
    throw new Error('未找到注册的专家插件')
  }

  const systemPrompt = await buildExpertSystemPrompt(expert, {
    generalPromptBuilder: params.generalPromptBuilder,
  })
  const tools = getExpertTools(expert)

  const result = await runExpertLoop({
    systemPrompt,
    userContent: params.userContent,
    tools,
    maxToolRounds: params.maxToolRounds,
    temperature: params.temperature ?? expert.model?.temperature ?? 0.5,
    maxTokens: params.maxTokens ?? expert.model?.maxTokens ?? 4096,
    model: params.model,
    isCancelled: params.isCancelled,
  })

  return {
    ...result,
    expertId: expert.id,
    legacyAgentKey: expert.legacyAgentKey,
  }
}

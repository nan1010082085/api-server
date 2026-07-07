/**
 * 解析 Expert 的 system prompt：动态 promptBuilder / 内联 / Skill 拼装。
 */

import {
  buildEditorSystemPrompt,
  buildFlowSystemPrompt,
  buildPageSystemPrompt,
} from '@schema-platform/ai-shared/promptBuilder'
import { getMetadata } from '../tools/toolHandlers.js'
import type { ExpertDeclaration } from './types.js'
import type { PluginRegistry } from './registry.js'

export async function resolveExpertSystemPrompt(
  expert: ExpertDeclaration,
  registry: PluginRegistry,
  opts: { generalPromptBuilder?: () => string } = {},
): Promise<string> {
  const skillBlocks = (expert.skills ?? [])
    .map((id) => registry.getSkill(id)?.content?.trim())
    .filter((block): block is string => Boolean(block))

  let base = ''
  if (expert.dynamicPrompt) {
    const metadata = getMetadata()
    switch (expert.dynamicPrompt) {
      case 'editor':
        base = buildEditorSystemPrompt(metadata)
        break
      case 'flow':
        base = buildFlowSystemPrompt(metadata)
        break
      case 'page':
        base = buildPageSystemPrompt(metadata)
        break
      case 'general':
        base = opts.generalPromptBuilder?.() ?? '你是通用 AI 助手。'
        break
      default:
        base = ''
    }
  } else if (expert.systemPrompt?.trim()) {
    base = expert.systemPrompt.trim()
  }

  if (!skillBlocks.length) return base
  if (!base) return skillBlocks.join('\n\n')
  return `${base}\n\n${skillBlocks.join('\n\n')}`
}

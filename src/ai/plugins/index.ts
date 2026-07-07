/**
 * 插件中心 — 配置文件驱动的 Expert / Skill / Tool / MCP 目录。
 */

import { loadPluginRegistry } from './loadPluginConfig.js'
import type { PluginRegistry } from './registry.js'

let _registry: PluginRegistry | null = null

export function getPluginRegistry(): PluginRegistry {
  if (!_registry) {
    _registry = loadPluginRegistry()
  }
  return _registry
}

/** 测试或热重载时重置 */
export function resetPluginRegistry(): void {
  _registry = null
}

export function initPluginRegistry(): PluginRegistry {
  return getPluginRegistry()
}

export type {
  ExpertDeclaration,
  ExpertRoutingDeclaration,
  LegacyAgentKey,
  McpServerDeclaration,
  PluginManifest,
  PluginRuntime,
  PluginToolDeclaration,
  SkillDeclaration,
  ToolKind,
} from './types.js'
export { PluginRegistry } from './registry.js'
export { loadPluginRegistry, resolvePluginConfigDir } from './loadPluginConfig.js'
export { resolveExpertSystemPrompt } from './resolveExpertPrompt.js'
export { resolveRoutedExpert, buildExpertCatalogForPrompt, expertToLegacyAgentKey } from './resolveRouterExpert.js'
export { runExpertLoop } from './runExpertLoop.js'
export type { RunExpertLoopParams, RunExpertLoopResult } from './runExpertLoop.js'
export {
  resolveExpertRef,
  buildExpertSystemPrompt,
  getExpertTools,
  runRegisteredExpert,
} from './dispatchExpert.js'
export type { ExpertRef, RunRegisteredExpertParams } from './dispatchExpert.js'

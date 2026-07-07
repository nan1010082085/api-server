/**
 * 插件中心 — 配置文件驱动的 Expert / Skill / Tool / MCP 目录。
 */

export { getPluginRegistry, resetPluginRegistry, initPluginRegistry } from './registrySingleton.js'

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
export { loadPluginRegistry, resolvePluginConfigDir, loadPluginDirectory } from './loadPluginConfig.js'
export { reloadPluginCenter, startPluginConfigWatch } from './pluginReload.js'
export type { PluginReloadResult } from './pluginReload.js'
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

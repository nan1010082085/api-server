/**
 * 插件 Registry 单例状态 — 避免 index ↔ pluginReload 循环依赖。
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

export function resetPluginRegistry(): void {
  _registry = null
}

export function initPluginRegistry(): PluginRegistry {
  return getPluginRegistry()
}

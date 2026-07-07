/**
 * 插件 Registry 单例状态 — 避免 index ↔ pluginReload 循环依赖。
 *
 * 多租户：请求内通过 tenantStorage 自动合并 plugins/tenants/{tenantId}/ overlay（LRU 缓存）。
 * 启动时无 tenant 上下文则仅 base + local（+ 可选 AI_PLUGIN_TENANT_ID 专租户部署）。
 */

import { tenantStorage } from '../../middleware/tenantContext.js'
import { loadPluginRegistry } from './loadPluginConfig.js'
import type { PluginRegistry } from './registry.js'

const MAX_REGISTRY_CACHE = 32
const registryCache = new Map<string, PluginRegistry>()

function resolveRuntimeTenantId(explicit?: string): string | undefined {
  const fromArg = explicit?.trim()
  if (fromArg) return fromArg
  return tenantStorage.getStore()?.tenantId?.trim() || undefined
}

function cacheKey(tenantId?: string): string {
  return tenantId ?? '__default__'
}

function rememberRegistry(key: string, registry: PluginRegistry): void {
  if (registryCache.size >= MAX_REGISTRY_CACHE) {
    const oldest = registryCache.keys().next().value
    if (oldest) registryCache.delete(oldest)
  }
  registryCache.set(key, registry)
}

export function getPluginRegistry(tenantId?: string): PluginRegistry {
  const resolved = resolveRuntimeTenantId(tenantId)
  const key = cacheKey(resolved)
  const cached = registryCache.get(key)
  if (cached) return cached

  const registry = loadPluginRegistry(resolved)
  rememberRegistry(key, registry)
  return registry
}

export function resetPluginRegistry(): void {
  registryCache.clear()
}

export function initPluginRegistry(): PluginRegistry {
  return getPluginRegistry()
}

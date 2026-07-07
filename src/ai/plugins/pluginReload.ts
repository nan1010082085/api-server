/**
 * 插件中心热重载 — SIGHUP 或监听 plugins/local/ 变更时重建 Registry 与工具表。
 */

import { existsSync, watch } from 'node:fs'
import path from 'node:path'
import { logger } from '../../utils/logger.js'
import { resolvePluginConfigDir } from './loadPluginConfig.js'
import { resetPluginRegistry, getPluginRegistry } from './registrySingleton.js'

export interface PluginReloadResult {
  toolCount: number
  mcpServerCount: number
  expertCount: number
}

let _watchStarted = false
let _reloadInFlight: Promise<PluginReloadResult> | null = null
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

/** 重置 Registry 并重建 MCP / HTTP / LangGraph 工具注册表 */
export async function reloadPluginCenter(): Promise<PluginReloadResult> {
  if (_reloadInFlight) return _reloadInFlight

  _reloadInFlight = (async () => {
    resetPluginRegistry()
    const { reloadToolsRegistry } = await import('../tools/registry.js')
    const { toolCount } = await reloadToolsRegistry()
    const registry = getPluginRegistry()
    const result: PluginReloadResult = {
      toolCount,
      mcpServerCount: registry.listMcpServers().length,
      expertCount: registry.listExperts().length,
    }
    logger.info({ msg: '[pluginReload] completed', ...result })
    return result
  })()

  try {
    return await _reloadInFlight
  } finally {
    _reloadInFlight = null
  }
}

function scheduleReloadFromWatch(reason: string): void {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    reloadPluginCenter().catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ msg: '[pluginReload] watch-triggered reload failed', reason, error: message })
    })
  }, 500)
}

/** 监听 config/plugins/local/ 变更（开发 / AI_PLUGIN_WATCH=1） */
export function startPluginConfigWatch(): void {
  if (_watchStarted) return
  if (process.env.AI_PLUGIN_WATCH === '0') return
  if (process.env.NODE_ENV === 'production' && process.env.AI_PLUGIN_WATCH !== '1') return

  const localDir = path.join(resolvePluginConfigDir(), 'plugins', 'local')
  if (!existsSync(localDir)) return

  _watchStarted = true
  watch(localDir, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith('.json')) return
    scheduleReloadFromWatch(filename)
  })
  logger.info({ msg: '[pluginReload] watching plugins/local for changes', dir: localDir })
}

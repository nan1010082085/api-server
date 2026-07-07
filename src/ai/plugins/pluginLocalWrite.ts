/**
 * 写入 plugins/local/ 单文件并触发热重载。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PLUGIN_PACK_LAYERS } from './pluginPack.js'
import { resolvePluginConfigDir } from './loadPluginConfig.js'
import { reloadPluginCenter } from './pluginReload.js'

export type PluginLocalLayer = (typeof PLUGIN_PACK_LAYERS)[number]

export function resolvePluginLocalFile(layer: PluginLocalLayer, filename: string): string {
  if (!PLUGIN_PACK_LAYERS.includes(layer)) {
    throw new Error(`Invalid plugin layer: ${layer}`)
  }
  const safeName = path.basename(filename)
  if (!safeName.endsWith('.json')) {
    throw new Error('Plugin local file must be .json')
  }
  const dir = path.join(resolvePluginConfigDir(), 'plugins', 'local', layer)
  mkdirSync(dir, { recursive: true })
  return path.join(dir, safeName)
}

export async function writePluginLocalJson(
  layer: PluginLocalLayer,
  filename: string,
  payload: unknown,
): Promise<{ path: string; reloaded: boolean }> {
  const filePath = resolvePluginLocalFile(layer, filename)
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  let reloaded = false
  if (existsSync(filePath)) {
    await reloadPluginCenter()
    reloaded = true
  }
  return { path: filePath, reloaded }
}

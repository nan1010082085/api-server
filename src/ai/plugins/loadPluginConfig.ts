/**
 * 从配置文件加载并合并插件清单。
 *
 * 加载顺序（后者覆盖同 id）：
 * 1. config/ai-plugins.builtin.json
 * 2. config/ai-plugins.json（若存在）
 * 3. config/ai-plugins.local.json（若存在，建议 gitignore）
 * 4. AI_PLUGIN_CONFIG_PATH 指向的文件（若设置）
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { PluginManifest } from './types.js'
import { PluginRegistry } from './registry.js'
import { logger } from '../../utils/logger.js'

export function resolvePluginConfigDir(): string {
  if (process.env.AI_PLUGIN_CONFIG_DIR) {
    return path.resolve(process.env.AI_PLUGIN_CONFIG_DIR)
  }
  return path.resolve(process.cwd(), 'config')
}

function readManifestFile(filePath: string): PluginManifest | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as PluginManifest
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ msg: '[pluginRegistry] failed to parse manifest', filePath, error: message })
    return null
  }
}

function mergeManifests(base: PluginManifest, patch: PluginManifest): PluginManifest {
  const mergeById = <T extends { id: string }>(a: T[] = [], b: T[] = []): T[] => {
    const map = new Map<string, T>()
    for (const item of a) map.set(item.id, item)
    for (const item of b) map.set(item.id, { ...map.get(item.id), ...item })
    return [...map.values()]
  }
  const mergeByName = <T extends { name: string }>(a: T[] = [], b: T[] = []): T[] => {
    const map = new Map<string, T>()
    for (const item of a) map.set(item.name, item)
    for (const item of b) map.set(item.name, { ...map.get(item.name), ...item })
    return [...map.values()]
  }

  return {
    version: patch.version || base.version,
    mcpServers: mergeById(base.mcpServers, patch.mcpServers),
    tools: mergeByName(base.tools, patch.tools),
    skills: mergeById(base.skills, patch.skills),
    experts: mergeById(base.experts, patch.experts),
  }
}

function resolveSkillFiles(manifest: PluginManifest, configDir: string): PluginManifest {
  const skills = (manifest.skills ?? []).map((skill) => {
    if (skill.content?.trim() || !skill.file) return skill
    const filePath = path.isAbsolute(skill.file)
      ? skill.file
      : path.join(configDir, skill.file)
    if (!existsSync(filePath)) {
      logger.warn({ msg: '[pluginRegistry] skill file not found', skillId: skill.id, filePath })
      return skill
    }
    const content = readFileSync(filePath, 'utf8')
    return { ...skill, content }
  })
  return { ...manifest, skills }
}

export function loadPluginRegistry(): PluginRegistry {
  const configDir = resolvePluginConfigDir()
  const paths = [
    path.join(configDir, 'ai-plugins.builtin.json'),
    path.join(configDir, 'ai-plugins.json'),
    path.join(configDir, 'ai-plugins.local.json'),
  ]
  if (process.env.AI_PLUGIN_CONFIG_PATH) {
    paths.push(path.resolve(process.env.AI_PLUGIN_CONFIG_PATH))
  }

  let merged: PluginManifest = { version: 1 }
  for (const filePath of paths) {
    const manifest = readManifestFile(filePath)
    if (!manifest) continue
    merged = mergeManifests(merged, manifest)
    logger.info({ msg: '[pluginRegistry] loaded manifest', filePath })
  }

  merged = resolveSkillFiles(merged, configDir)

  const registry = new PluginRegistry()
  registry.registerManifest(merged, 'merged')
  logger.info({
    msg: '[pluginRegistry] ready',
    experts: registry.listExperts().length,
    skills: registry.listSkills().length,
    tools: registry.listToolDeclarations().length,
    mcpServers: registry.listMcpServers().length,
  })
  return registry
}

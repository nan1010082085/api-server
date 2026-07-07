/**
 * 从配置文件加载并合并插件清单。
 *
 * 推荐：config/plugins/{mcp,tools,experts,skills}/ 分文件目录（见 config/plugins/README.md）
 *
 * 加载顺序（后者覆盖同 id / name）：
 * 1. config/plugins/ 分目录
 * 2. config/ai-plugins.builtin.json（废弃，兼容）
 * 3. config/ai-plugins.json
 * 4. config/plugins/local/ 分目录
 * 5. config/plugins/tenants/{AI_PLUGIN_TENANT_ID}/（可选，专租户部署）
 * 6. config/ai-plugins.local.json
 * 7. AI_PLUGIN_CONFIG_PATH（文件或同结构目录）
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type {
  ExpertDeclaration,
  McpServerDeclaration,
  PluginManifest,
  PluginToolDeclaration,
  SkillDeclaration,
} from './types.js'
import { PluginRegistry } from './registry.js'
import { logger } from '../../utils/logger.js'

const PLUGIN_LAYERS = ['mcp', 'tools', 'experts', 'skills'] as const
type PluginLayer = (typeof PLUGIN_LAYERS)[number]

export function resolvePluginConfigDir(): string {
  if (process.env.AI_PLUGIN_CONFIG_DIR) {
    return path.resolve(process.env.AI_PLUGIN_CONFIG_DIR)
  }
  return path.resolve(process.cwd(), 'config')
}

function readJsonFile(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as unknown
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ msg: '[pluginRegistry] failed to parse JSON', filePath, error: message })
    return null
  }
}

function readManifestFile(filePath: string): PluginManifest | null {
  const parsed = readJsonFile(filePath)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed as PluginManifest
}

function asToolList(raw: unknown): PluginToolDeclaration[] {
  if (Array.isArray(raw)) return raw as PluginToolDeclaration[]
  if (raw && typeof raw === 'object' && Array.isArray((raw as PluginManifest).tools)) {
    return (raw as PluginManifest).tools!
  }
  return []
}

/** 从 plugins/{mcp,tools,experts,skills}/*.json 加载一层 manifest */
export function loadPluginDirectory(dir: string, label: string): PluginManifest {
  const manifest: PluginManifest = { version: 1 }
  if (!existsSync(dir)) return manifest

  for (const layer of PLUGIN_LAYERS) {
    const layerDir = path.join(dir, layer)
    if (!existsSync(layerDir)) continue

    const files = readdirSync(layerDir)
      .filter((name) => name.endsWith('.json'))
      .sort()

    for (const file of files) {
      const filePath = path.join(layerDir, file)
      const raw = readJsonFile(filePath)
      if (!raw) continue

      if (layer === 'mcp') {
        manifest.mcpServers = [...(manifest.mcpServers ?? []), raw as McpServerDeclaration]
      } else if (layer === 'tools') {
        manifest.tools = [...(manifest.tools ?? []), ...asToolList(raw)]
      } else if (layer === 'experts') {
        manifest.experts = [...(manifest.experts ?? []), raw as ExpertDeclaration]
      } else if (layer === 'skills') {
        manifest.skills = [...(manifest.skills ?? []), raw as SkillDeclaration]
      }

      logger.info({ msg: '[pluginRegistry] loaded plugin file', label, layer, file })
    }
  }

  return manifest
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

function applyConfigPath(merged: PluginManifest, configPath: string): PluginManifest {
  const resolved = path.resolve(configPath)
  if (!existsSync(resolved)) return merged
  if (statSync(resolved).isDirectory()) {
    return mergeManifests(merged, loadPluginDirectory(resolved, 'AI_PLUGIN_CONFIG_PATH'))
  }
  const fileManifest = readManifestFile(resolved)
  return fileManifest ? mergeManifests(merged, fileManifest) : merged
}

export function loadPluginRegistry(): PluginRegistry {
  const configDir = resolvePluginConfigDir()
  const pluginsRoot = path.join(configDir, 'plugins')
  const localRoot = path.join(pluginsRoot, 'local')

  let merged: PluginManifest = { version: 1 }

  merged = mergeManifests(merged, loadPluginDirectory(pluginsRoot, 'plugins'))

  const legacyPaths = [
    path.join(configDir, 'ai-plugins.builtin.json'),
    path.join(configDir, 'ai-plugins.json'),
  ]
  for (const filePath of legacyPaths) {
    const manifest = readManifestFile(filePath)
    if (!manifest) continue
    merged = mergeManifests(merged, manifest)
    logger.info({ msg: '[pluginRegistry] loaded legacy manifest', filePath })
  }

  merged = mergeManifests(merged, loadPluginDirectory(localRoot, 'plugins/local'))

  const tenantId = process.env.AI_PLUGIN_TENANT_ID?.trim()
  if (tenantId) {
    const tenantRoot = path.join(pluginsRoot, 'tenants', tenantId)
    merged = mergeManifests(merged, loadPluginDirectory(tenantRoot, `plugins/tenants/${tenantId}`))
  }

  const localFile = path.join(configDir, 'ai-plugins.local.json')
  const localManifest = readManifestFile(localFile)
  if (localManifest) {
    merged = mergeManifests(merged, localManifest)
    logger.info({ msg: '[pluginRegistry] loaded legacy manifest', filePath: localFile })
  }

  if (process.env.AI_PLUGIN_CONFIG_PATH) {
    merged = applyConfigPath(merged, process.env.AI_PLUGIN_CONFIG_PATH)
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

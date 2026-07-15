/**
 * 从配置文件加载并合并插件清单。
 *
 * 加载顺序（后者覆盖同 id / name）：
 * 1. config/plugins/{mcp,tools,experts,skills}/
 * 2. config/plugins/local/
 * 3. config/plugins/tenants/{AI_PLUGIN_TENANT_ID}/（可选）
 * 4. AI_PLUGIN_CONFIG_PATH（文件或同结构目录）
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

/**
 * 解析插件配置根目录（其下应有 `plugins/`）。
 *
 * 优先级：
 * 1. `AI_PLUGIN_CONFIG_DIR`
 * 2. 从本文件向上查找含 `config/plugins` 的目录（兼容 src / dist / 部署展平布局）
 * 3. cwd 下 `config` 或 `server/config`
 */
export function resolvePluginConfigDir(): string {
  if (process.env.AI_PLUGIN_CONFIG_DIR) {
    return path.resolve(process.env.AI_PLUGIN_CONFIG_DIR)
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'config')
    if (existsSync(path.join(candidate, 'plugins'))) {
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const rel of ['config', 'server/config']) {
    const candidate = path.resolve(process.cwd(), rel)
    if (existsSync(path.join(candidate, 'plugins'))) {
      return candidate
    }
  }

  const fallback = path.resolve(here, '..', '..', '..', 'config')
  logger.warn({
    msg: '[pluginRegistry] config/plugins not found by walk; using fallback',
    here,
    fallback,
    cwd: process.cwd(),
  })
  return fallback
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
        manifest.skills = [...(manifest.skills ?? []), resolveSkillInline(raw as SkillDeclaration, layerDir)]
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

function resolveSkillInline(skill: SkillDeclaration, layerDir: string): SkillDeclaration {
  if (skill.content?.trim() || !skill.file) return skill
  const filePath = path.isAbsolute(skill.file)
    ? skill.file
    : path.join(layerDir, skill.file)
  if (!existsSync(filePath)) {
    logger.warn({ msg: '[pluginRegistry] skill file not found', skillId: skill.id, filePath })
    return skill
  }
  const content = readFileSync(filePath, 'utf8')
  return { ...skill, content }
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

export function loadPluginRegistry(runtimeTenantId?: string): PluginRegistry {
  const configDir = resolvePluginConfigDir()
  const pluginsRoot = path.join(configDir, 'plugins')
  logger.info({
    msg: '[pluginRegistry] loading',
    configDir,
    pluginsRoot,
    exists: existsSync(pluginsRoot),
  })
  const localRoot = path.join(pluginsRoot, 'local')

  let merged: PluginManifest = { version: 1 }

  merged = mergeManifests(merged, loadPluginDirectory(pluginsRoot, 'plugins'))

  merged = mergeManifests(merged, loadPluginDirectory(localRoot, 'plugins/local'))

  const tenantId = runtimeTenantId?.trim() || process.env.AI_PLUGIN_TENANT_ID?.trim()
  if (tenantId) {
    const tenantRoot = path.join(pluginsRoot, 'tenants', tenantId)
    merged = mergeManifests(merged, loadPluginDirectory(tenantRoot, `plugins/tenants/${tenantId}`))
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

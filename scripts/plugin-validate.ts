#!/usr/bin/env tsx
/**
 * 校验插件配置：MCP source 引用、Expert/Skill 工具引用、JSON 可解析性。
 *
 * Usage: pnpm plugin:validate
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginRegistry, resolvePluginConfigDir } from '../src/ai/plugins/loadPluginConfig.js'
import { LANGGRAPH_ONLY_TOOL_NAMES } from '../src/ai/tools/langgraphTools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

interface ValidationIssue {
  level: 'error' | 'warn'
  message: string
}

const issues: ValidationIssue[] = []

function addIssue(level: ValidationIssue['level'], message: string): void {
  issues.push({ level, message })
}

function collectJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const result: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectJsonFiles(full))
    } else if (entry.name.endsWith('.json')) {
      result.push(full)
    }
  }
  return result
}

function validateJsonParseable(): void {
  const configDir = resolvePluginConfigDir()
  const pluginsDir = path.join(configDir, 'plugins')
  const legacyFiles = [
    path.join(configDir, 'ai-plugins.builtin.json'),
    path.join(configDir, 'ai-plugins.json'),
    path.join(configDir, 'ai-plugins.local.json'),
  ]

  for (const file of [...legacyFiles, ...collectJsonFiles(pluginsDir)]) {
    if (!existsSync(file)) continue
    try {
      JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      addIssue('error', `Invalid JSON: ${path.relative(root, file)} — ${message}`)
    }
  }
}

function validateRegistryReferences(): void {
  const registry = loadPluginRegistry()
  const mcpIds = new Set(registry.listMcpServers().map((s) => s.id))
  const toolNames = new Set(registry.listToolDeclarations().map((t) => t.name))
  const skillIds = new Set(registry.listSkills().map((s) => s.id))
  const expertIds = new Set(registry.listExperts().map((e) => e.id))

  for (const tool of registry.listToolDeclarations()) {
    if (tool.kind === 'mcp' && tool.source && !mcpIds.has(tool.source)) {
      addIssue('error', `Tool ${tool.name} references unknown MCP server "${tool.source}"`)
    }
  }

  const knownTools = new Set([...toolNames, ...LANGGRAPH_ONLY_TOOL_NAMES])

  function checkToolRef(owner: string, name: string): void {
    if (!knownTools.has(name)) {
      addIssue('error', `${owner} references unknown tool "${name}"`)
    }
  }

  for (const expert of registry.listExperts()) {
    if (!expert.id?.trim()) {
      addIssue('error', 'Expert missing id')
      continue
    }
    for (const tool of expert.tools ?? []) checkToolRef(`Expert ${expert.id}`, tool)
    for (const skillId of expert.skills ?? []) {
      if (!skillIds.has(skillId)) {
        addIssue('error', `Expert ${expert.id} references unknown skill "${skillId}"`)
      }
    }
  }

  for (const skill of registry.listSkills()) {
    for (const tool of skill.tools ?? []) checkToolRef(`Skill ${skill.id}`, tool)
  }

  if (expertIds.size === 0) {
    addIssue('warn', 'No experts loaded — check config/plugins/experts/')
  }
  if (mcpIds.size === 0) {
    addIssue('warn', 'No MCP servers loaded — check config/plugins/mcp/')
  }
}

validateJsonParseable()
validateRegistryReferences()

const errors = issues.filter((i) => i.level === 'error')
const warns = issues.filter((i) => i.level === 'warn')

for (const w of warns) console.warn(`[warn] ${w.message}`)
for (const e of errors) console.error(`[error] ${e.message}`)

if (errors.length > 0) {
  console.error(`\nplugin:validate failed with ${errors.length} error(s), ${warns.length} warning(s)`)
  process.exit(1)
}

console.log(`plugin:validate OK (${warns.length} warning(s))`)

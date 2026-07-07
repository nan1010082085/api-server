import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginRegistry, resetPluginRegistry } from '../plugins/index.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

describe('pluginRegistry', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
    delete process.env.AI_PLUGIN_CONFIG_PATH
  })

  it('loads builtin experts and tools from config', () => {
    const registry = loadPluginRegistry()
    const editor = registry.getExpertByLegacyKey('editor')
    expect(editor?.id).toBe('platform.editor')
    expect(editor?.tools).toContain('schema__search')
    expect(editor?.tools).toContain('update_schema')
    expect(registry.resolveExpertToolNamesByLegacyKey('flow')).toContain('update_flow')
    expect(registry.listMcpServers().length).toBeGreaterThanOrEqual(5)
  })

  it('matches experts by routing keywords', () => {
    const registry = loadPluginRegistry()
    const matched = registry.matchExpertsByRouting({
      text: '帮我设计一个审批流程',
      contextSource: 'standalone',
      runtime: 'langgraph',
    })
    expect(matched[0]?.legacyAgentKey).toBe('flow')
  })

  it('merges override manifest from AI_PLUGIN_CONFIG_PATH directory', () => {
    const overrideDir = path.join(configDir, 'plugins/local.example')
    process.env.AI_PLUGIN_CONFIG_PATH = overrideDir
    resetPluginRegistry()
    const registry = loadPluginRegistry()
    expect(registry.getExpert('example.support')).toBeUndefined()
    expect(registry.getExpert('platform.editor')).toBeDefined()
  })

  it('loads split plugin directory files', () => {
    const registry = loadPluginRegistry()
    expect(registry.getMcpServer('platform.schema')).toBeDefined()
    expect(registry.getToolDeclaration('schema__search')).toBeDefined()
    expect(registry.getExpert('platform.flow')).toBeDefined()
  })
})

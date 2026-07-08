import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { loadPluginRegistry, resetPluginRegistry } from '../plugins/index.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

const tmpDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../tmp-test-plugins',
)

describe('pluginValidate - tool label/category required', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
    delete process.env.AI_PLUGIN_CONFIG_PATH
  })

  afterEach(() => {
    resetPluginRegistry()
    delete process.env.AI_PLUGIN_CONFIG_DIR
    delete process.env.AI_PLUGIN_CONFIG_PATH
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('should have label and category on all builtin tools', () => {
    const registry = loadPluginRegistry()
    const tools = registry.listToolDeclarations()

    for (const tool of tools) {
      expect(tool.label, `Tool ${tool.name} should have label`).toBeDefined()
      expect(tool.label?.trim(), `Tool ${tool.name} label should not be empty`).toBeTruthy()
      expect(tool.category, `Tool ${tool.name} should have category`).toBeDefined()
      expect(tool.category?.trim(), `Tool ${tool.name} category should not be empty`).toBeTruthy()
    }
  })

  it('should detect tool missing label', () => {
    mkdirSync(path.join(tmpDir, 'tools'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'tools', 'bad-tools.json'),
      JSON.stringify({
        tools: [
          { name: 'test__no_label', kind: 'mcp', category: 'mcp-schema', source: 'platform.schema' },
        ],
      }),
    )

    process.env.AI_PLUGIN_CONFIG_PATH = tmpDir
    resetPluginRegistry()
    const registry = loadPluginRegistry()

    const tool = registry.getToolDeclaration('test__no_label')
    expect(tool).toBeDefined()
    expect(tool?.label?.trim()).toBeFalsy()
  })

  it('should detect tool missing category', () => {
    mkdirSync(path.join(tmpDir, 'tools'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'tools', 'bad-tools.json'),
      JSON.stringify({
        tools: [
          { name: 'test__no_category', kind: 'mcp', label: 'Test Tool', source: 'platform.schema' },
        ],
      }),
    )

    process.env.AI_PLUGIN_CONFIG_PATH = tmpDir
    resetPluginRegistry()
    const registry = loadPluginRegistry()

    const tool = registry.getToolDeclaration('test__no_category')
    expect(tool).toBeDefined()
    expect(tool?.category?.trim()).toBeFalsy()
  })

  it('should accept tool with both label and category', () => {
    mkdirSync(path.join(tmpDir, 'tools'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, 'tools', 'good-tools.json'),
      JSON.stringify({
        tools: [
          { name: 'test__valid', kind: 'mcp', label: 'Valid Tool', category: 'mcp-schema', source: 'platform.schema' },
        ],
      }),
    )

    process.env.AI_PLUGIN_CONFIG_PATH = tmpDir
    resetPluginRegistry()
    const registry = loadPluginRegistry()

    const tool = registry.getToolDeclaration('test__valid')
    expect(tool).toBeDefined()
    expect(tool?.label).toBe('Valid Tool')
    expect(tool?.category).toBe('mcp-schema')
  })
})

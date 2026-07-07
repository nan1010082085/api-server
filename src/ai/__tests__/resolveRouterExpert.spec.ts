import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginRegistry, resetPluginRegistry } from '../plugins/index.js'
import { resolveRoutedExpert, buildExpertCatalogForPrompt } from '../plugins/resolveRouterExpert.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

describe('resolveRouterExpert', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
  })

  it('resolves flow expert from registry routing', () => {
    loadPluginRegistry()
    const expert = resolveRoutedExpert({ text: '帮我设计审批流程', contextSource: 'standalone' })
    expect(expert?.legacyAgentKey).toBe('flow')
  })

  it('builds planner catalog from registry', () => {
    loadPluginRegistry()
    const catalog = buildExpertCatalogForPrompt()
    expect(catalog).toContain('platform.editor')
    expect(catalog).toContain('platform.flow')
  })
})

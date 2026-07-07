import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginRegistry, resetPluginRegistry } from '../plugins/index.js'
import { resolveExpertRef } from '../plugins/dispatchExpert.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

describe('dispatchExpert', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
    delete process.env.AI_PLUGIN_CONFIG_PATH
    loadPluginRegistry()
  })

  it('resolves expert by legacy key and by id', () => {
    const byLegacy = resolveExpertRef({ legacyAgentKey: 'editor' })
    expect(byLegacy?.id).toBe('platform.editor')
    const byId = resolveExpertRef({ expertId: 'platform.flow' })
    expect(byId?.legacyAgentKey).toBe('flow')
    expect(byLegacy?.tools.length).toBeGreaterThan(0)
  })
})

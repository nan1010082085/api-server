import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetPluginRegistry } from '../plugins/registrySingleton.js'
import { reloadPluginCenter } from '../plugins/pluginReload.js'
import { getAllToolsSync, isToolsReady } from '../tools/registry.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

describe('pluginReload', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
    delete process.env.AI_PLUGIN_CONFIG_PATH
  })

  it('reloadPluginCenter rebuilds registry and tools', async () => {
    expect(isToolsReady()).toBe(true)
    const before = getAllToolsSync().length

    const result = await reloadPluginCenter()

    expect(result.toolCount).toBeGreaterThan(0)
    expect(result.mcpServerCount).toBeGreaterThanOrEqual(5)
    expect(result.expertCount).toBeGreaterThanOrEqual(4)
    expect(getAllToolsSync().length).toBe(result.toolCount)
    expect(getAllToolsSync().length).toBeGreaterThanOrEqual(before)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { writePluginLocalJson } from '../plugins/pluginLocalWrite.js'
import { resetPluginRegistry } from '../plugins/registrySingleton.js'

describe('pluginLocalWrite', () => {
  let configDir: string

  afterEach(() => {
    if (configDir && existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true })
    }
    delete process.env.AI_PLUGIN_CONFIG_DIR
    resetPluginRegistry()
  })

  it('writes JSON to plugins/local and reloads registry', async () => {
    configDir = path.join(tmpdir(), `plugin-local-${Date.now()}`)
    process.env.AI_PLUGIN_CONFIG_DIR = configDir

    const payload = {
      id: 'local.test-skill',
      label: '本地测试 Skill',
      content: '仅本机生效',
      enabled: true,
    }

    const result = await writePluginLocalJson('skills', 'local.test-skill.json', payload)
    expect(result.reloaded).toBe(true)
    expect(existsSync(result.path)).toBe(true)
    expect(JSON.parse(readFileSync(result.path, 'utf8'))).toMatchObject({ id: 'local.test-skill' })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  packPluginDirectory,
  installPluginArchive,
  validatePackDirectory,
} from '../plugins/pluginPack.js'
import { loadPluginRegistry as loadFromConfig } from '../plugins/loadPluginConfig.js'
import { resetPluginRegistry } from '../plugins/registrySingleton.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)
const examplePack = path.join(configDir, 'plugins/packs/example.support')

describe('pluginPack', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'plugin-pack-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('validates example pack directory', () => {
    const manifest = validatePackDirectory(examplePack)
    expect(manifest.id).toBe('example.support')
    expect(manifest.version).toBe('1.0.0')
  })

  it('pack and install to local overlay', () => {
    const archive = path.join(tempDir, 'example.support.tgz')
    packPluginDirectory(examplePack, archive)
    expect(existsSync(archive)).toBe(true)

    const installConfig = path.join(tempDir, 'config')
    installPluginArchive(archive, 'local', installConfig)

    expect(existsSync(path.join(installConfig, 'plugins/local/experts/example.support.json'))).toBe(true)
    expect(existsSync(path.join(installConfig, 'plugins/local/mcp/example.external-kb.json'))).toBe(true)
  })

  it('loads tenant overlay when AI_PLUGIN_TENANT_ID is set', () => {
    const tenantId = 'test-tenant'
    const archive = path.join(tempDir, 'example.support.tgz')
    packPluginDirectory(examplePack, archive)

    const installConfig = path.join(tempDir, 'config')
    installPluginArchive(archive, `tenant:${tenantId}`, installConfig)

    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = installConfig
    process.env.AI_PLUGIN_TENANT_ID = tenantId
    delete process.env.AI_PLUGIN_CONFIG_PATH

    const registry = loadFromConfig()
    expect(registry.getToolDeclaration('kb__search')).toBeDefined()

    delete process.env.AI_PLUGIN_TENANT_ID
    resetPluginRegistry()
  })
})

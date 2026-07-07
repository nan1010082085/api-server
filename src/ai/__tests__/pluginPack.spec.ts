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
import { loadPluginDirectory, loadPluginRegistry as loadFromConfig } from '../plugins/loadPluginConfig.js'
import { tenantStorage } from '../../middleware/tenantContext.js'
import { resetPluginRegistry, getPluginRegistry } from '../plugins/registrySingleton.js'

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
    expect(existsSync(path.join(installConfig, 'plugins/local/skills/example.support-tone.md'))).toBe(true)
  })

  it('loads skill content from markdown file in pack directory', () => {
    const manifest = loadPluginDirectory(examplePack, 'pack')
    const skill = manifest.skills?.find((s) => s.id === 'example.support-tone')
    expect(skill?.content).toContain('客服语气')
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

  it('merges tenant overlay from async context without AI_PLUGIN_TENANT_ID', async () => {
    const tenantId = 'ctx-tenant'
    const archive = path.join(tempDir, 'example.support.tgz')
    packPluginDirectory(examplePack, archive)

    const installConfig = path.join(tempDir, 'config')
    installPluginArchive(archive, `tenant:${tenantId}`, installConfig)

    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = installConfig
    delete process.env.AI_PLUGIN_TENANT_ID
    delete process.env.AI_PLUGIN_CONFIG_PATH

    await tenantStorage.run({ tenantId }, async () => {
      const registry = getPluginRegistry()
      expect(registry.getToolDeclaration('kb__search')).toBeDefined()
    })

    const defaultRegistry = getPluginRegistry()
    expect(defaultRegistry.getToolDeclaration('kb__search')).toBeUndefined()

    resetPluginRegistry()
  })
})

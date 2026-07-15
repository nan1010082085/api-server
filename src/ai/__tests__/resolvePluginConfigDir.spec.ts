/**
 * resolvePluginConfigDir — 布局兼容：src / dist / 部署展平（server/ai/...）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePluginConfigDir } from '../plugins/loadPluginConfig.js'

const realConfigDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

describe('resolvePluginConfigDir', () => {
  const prev = process.env.AI_PLUGIN_CONFIG_DIR

  afterEach(() => {
    if (prev === undefined) delete process.env.AI_PLUGIN_CONFIG_DIR
    else process.env.AI_PLUGIN_CONFIG_DIR = prev
  })

  beforeEach(() => {
    delete process.env.AI_PLUGIN_CONFIG_DIR
  })

  it('honors AI_PLUGIN_CONFIG_DIR when set', () => {
    process.env.AI_PLUGIN_CONFIG_DIR = '/tmp/fake-plugin-config'
    expect(resolvePluginConfigDir()).toBe(path.resolve('/tmp/fake-plugin-config'))
  })

  it('walks up from this package and finds server/config/plugins', () => {
    const resolved = resolvePluginConfigDir()
    expect(resolved).toBe(realConfigDir)
    expect(resolved.endsWith(`${path.sep}config`) || resolved.endsWith('/config')).toBe(true)
  })
})

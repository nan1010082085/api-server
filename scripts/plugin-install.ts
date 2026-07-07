#!/usr/bin/env tsx
/**
 * 安装插件包 .tgz 到 plugins/local 或 plugins/tenants/{tenantId}。
 *
 * Usage:
 *   pnpm plugin:install --file dist/example.support.tgz
 *   pnpm plugin:install --file dist/example.support.tgz --tenant acme
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installPluginArchive } from '../src/ai/plugins/pluginPack.js'
import { resolvePluginConfigDir } from '../src/ai/plugins/loadPluginConfig.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

const file = arg('--file')
if (!file) {
  console.error('Usage: pnpm plugin:install --file <pack.tgz> [--tenant <tenantId>]')
  process.exit(1)
}

const tenant = arg('--tenant')?.trim()
const target = tenant ? (`tenant:${tenant}` as const) : 'local'
const configDir = resolvePluginConfigDir()
const manifest = installPluginArchive(path.resolve(file), target, configDir)

console.log(
  `plugin:install OK ${manifest.id}@${manifest.version} → `
  + (tenant ? `plugins/tenants/${tenant}` : 'plugins/local'),
)

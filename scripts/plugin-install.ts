#!/usr/bin/env tsx
/**
 * 安装插件包 .tgz 到 plugins/local 或 plugins/tenants/{tenantId}。
 * 支持签名验证：设置 PLUGIN_SIGN_KEY 环境变量时自动验证签名。
 *
 * Usage:
 *   pnpm plugin:install --file dist/example.support.tgz
 *   pnpm plugin:install --file dist/example.support.tgz --tenant acme
 *   PLUGIN_SIGN_KEY=<secret> pnpm plugin:install --file ...
 *   pnpm plugin:install --file ... --force   (跳过签名过期检查)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installPluginArchive, verifyPluginSignature } from '../src/ai/plugins/pluginPack.js'
import { resolvePluginConfigDir } from '../src/ai/plugins/loadPluginConfig.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

const file = arg('--file')
if (!file) {
  console.error('Usage: pnpm plugin:install --file <pack.tgz> [--tenant <tenantId>] [--force]')
  process.exit(1)
}

const signKey = process.env.PLUGIN_SIGN_KEY
const force = hasFlag('--force')

// 签名验证
if (signKey) {
  const result = verifyPluginSignature(path.resolve(file), signKey)
  if (!result.valid) {
    if (result.reason === 'expired' && force) {
      console.warn(`[warn] signature expired (signedAt=${result.signedAt}), proceeding due to --force`)
    } else {
      const msg = result.reason === 'missing'
        ? 'signature or signedAt missing from manifest'
        : result.reason === 'mismatch'
          ? 'signature verification failed (HMAC mismatch)'
          : `signature expired (signedAt=${result.signedAt}). Use --force to bypass`
      console.error(`[error] ${msg}`)
      process.exit(1)
    }
  } else {
    console.log(`signature OK (signedAt=${result.signedAt})`)
  }
} else {
  console.warn('[warn] PLUGIN_SIGN_KEY not set, skipping signature verification')
}

const tenant = arg('--tenant')?.trim()
const target = tenant ? (`tenant:${tenant}` as const) : 'local'
const configDir = resolvePluginConfigDir()
const manifest = installPluginArchive(path.resolve(file), target, configDir)

console.log(
  `plugin:install OK ${manifest.id}@${manifest.version} → `
  + (tenant ? `plugins/tenants/${tenant}` : 'plugins/local'),
)

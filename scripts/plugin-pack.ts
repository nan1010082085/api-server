#!/usr/bin/env tsx
/**
 * 将插件目录打包为 .tgz（含 manifest.json + mcp/tools/experts/skills）。
 * 支持 HMAC-SHA256 签名：设置 PLUGIN_SIGN_KEY 环境变量即可自动签名。
 *
 * Usage:
 *   pnpm plugin:pack --dir config/plugins/packs/example.support [--out dist/example.support.tgz]
 *   PLUGIN_SIGN_KEY=<secret> pnpm plugin:pack --dir ...
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packPluginDirectory, signPluginPack } from '../src/ai/plugins/pluginPack.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

const dir = arg('--dir')
if (!dir) {
  console.error('Usage: pnpm plugin:pack --dir <pack-directory> [--out <file.tgz>]')
  process.exit(1)
}

const packDir = path.resolve(dir)
const outFile = path.resolve(arg('--out') ?? `dist/${path.basename(packDir)}-${Date.now()}.tgz`)
const signKey = process.env.PLUGIN_SIGN_KEY

const manifest = signKey
  ? signPluginPack(packDir, outFile, signKey)
  : packPluginDirectory(packDir, outFile)

const sigInfo = manifest.signature ? ` signed=${manifest.signature.slice(0, 12)}...` : ''
console.log(`plugin:pack OK ${manifest.id}@${manifest.version}${sigInfo}`)

#!/usr/bin/env tsx
/**
 * 将插件目录打包为 .tgz（含 manifest.json + mcp/tools/experts/skills）。
 *
 * Usage: pnpm plugin:pack --dir config/plugins/packs/example.support [--out dist/example.support.tgz]
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packPluginDirectory } from '../src/ai/plugins/pluginPack.js'

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
const manifest = packPluginDirectory(
  packDir,
  path.resolve(arg('--out') ?? `dist/${path.basename(packDir)}-${Date.now()}.tgz`),
)

console.log(`plugin:pack OK ${manifest.id}@${manifest.version}`)

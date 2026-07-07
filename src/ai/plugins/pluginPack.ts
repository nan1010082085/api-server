/**
 * 插件包 pack / install 工具。
 *
 * 包结构：
 *   manifest.json
 *   mcp/ | tools/ | experts/ | skills/
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { PluginPackManifest } from './types.js'

export const PLUGIN_PACK_LAYERS = ['mcp', 'tools', 'experts', 'skills'] as const
export type PluginPackLayer = (typeof PLUGIN_PACK_LAYERS)[number]

export function readPackManifest(packDir: string): PluginPackManifest {
  const manifestPath = path.join(packDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Plugin pack missing manifest.json: ${packDir}`)
  }
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginPackManifest
  validatePackManifest(raw)
  return raw
}

export function validatePackManifest(manifest: PluginPackManifest): void {
  if (!manifest.id?.trim()) throw new Error('Plugin pack manifest.id is required')
  if (!manifest.name?.trim()) throw new Error('Plugin pack manifest.name is required')
  if (!manifest.version?.trim()) throw new Error('Plugin pack manifest.version is required')
}

export function validatePackDirectory(packDir: string): PluginPackManifest {
  const manifest = readPackManifest(packDir)
  let hasLayer = false
  for (const layer of PLUGIN_PACK_LAYERS) {
    const layerDir = path.join(packDir, layer)
    if (!existsSync(layerDir)) continue
    const files = readdirSync(layerDir).filter((f) => f.endsWith('.json'))
    if (files.length) hasLayer = true
  }
  if (!hasLayer) {
    throw new Error(`Plugin pack ${manifest.id} has no mcp/tools/experts/skills JSON files`)
  }
  return manifest
}

export function packPluginDirectory(packDir: string, outFile: string): PluginPackManifest {
  const resolved = path.resolve(packDir)
  const manifest = validatePackDirectory(resolved)
  mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  const parent = path.dirname(resolved)
  const base = path.basename(resolved)
  execSync(`tar -czf ${JSON.stringify(path.resolve(outFile))} -C ${JSON.stringify(parent)} ${JSON.stringify(base)}`, {
    stdio: 'inherit',
  })
  return manifest
}

export function extractPluginArchive(archivePath: string, destDir: string): string {
  mkdirSync(destDir, { recursive: true })
  execSync(`tar -xzf ${JSON.stringify(path.resolve(archivePath))} -C ${JSON.stringify(destDir)}`, {
    stdio: 'inherit',
  })
  const entries = readdirSync(destDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  if (entries.length !== 1) {
    throw new Error('Plugin archive must contain exactly one top-level directory')
  }
  return path.join(destDir, entries[0]!.name)
}

export function copyPackLayers(srcPackDir: string, targetPluginsDir: string): void {
  for (const layer of PLUGIN_PACK_LAYERS) {
    const srcLayer = path.join(srcPackDir, layer)
    if (!existsSync(srcLayer)) continue
    const destLayer = path.join(targetPluginsDir, layer)
    mkdirSync(destLayer, { recursive: true })
    for (const file of readdirSync(srcLayer).filter((f) => f.endsWith('.json'))) {
      cpSync(path.join(srcLayer, file), path.join(destLayer, file))
    }
  }
}

export function installPluginArchive(
  archivePath: string,
  target: 'local' | `tenant:${string}`,
  configDir: string,
): PluginPackManifest {
  const tempRoot = path.join(tmpdir(), `plugin-install-${Date.now()}`)
  mkdirSync(tempRoot, { recursive: true })
  try {
    const packDir = extractPluginArchive(archivePath, tempRoot)
    const manifest = validatePackDirectory(packDir)
    const pluginsRoot = path.join(configDir, 'plugins')
    const targetDir = target === 'local'
      ? path.join(pluginsRoot, 'local')
      : path.join(pluginsRoot, 'tenants', target.slice('tenant:'.length))
    copyPackLayers(packDir, targetDir)
    return manifest
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

export function resolvePluginInstallTarget(
  configDir: string,
  target: 'local' | `tenant:${string}`,
): string {
  const pluginsRoot = path.join(configDir, 'plugins')
  return target === 'local'
    ? path.join(pluginsRoot, 'local')
    : path.join(pluginsRoot, 'tenants', target.slice('tenant:'.length))
}

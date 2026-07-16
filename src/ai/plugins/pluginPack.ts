/**
 * 插件包 pack / install 工具。
 *
 * 包结构：
 *   manifest.json
 *   mcp/ | tools/ | experts/ | skills/
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { PluginPackManifest } from './types.js'

/** 签名时间窗口：90 天 */
const SIGNATURE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

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
    for (const file of readdirSync(srcLayer)) {
      const isJson = file.endsWith('.json')
      const isSkillAsset = layer === 'skills' && file.endsWith('.md')
      if (!isJson && !isSkillAsset) continue
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

// ─── 签名 / 验签 ───────────────────────────────────────────────────────────

/**
 * 计算目录内容的确定性 HMAC-SHA256 签名。
 * 签名对象：按相对路径排序的所有文件，格式为 [path]\0[content] 的拼接。
 * 排除 manifest.json 中的 signature / signedAt 字段。
 * 不依赖 tgz 字节（gzip 非确定性），保证签名跨平台可复现。
 */
export function computeDirectorySignature(dir: string, key: string): string {
  function collectFiles(current: string, prefix: string): Array<{ rel: string; abs: string }> {
    const results: Array<{ rel: string; abs: string }> = []
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        results.push(...collectFiles(abs, rel))
      } else if (entry.isFile()) {
        results.push({ rel, abs })
      }
    }
    return results
  }

  const files = collectFiles(dir, '').sort((a, b) => a.rel.localeCompare(b.rel))
  const hmac = createHmac('sha256', key)

  for (const { rel, abs } of files) {
    let content = readFileSync(abs)

    // manifest.json: 移除 signature / signedAt 后再签名
    if (rel === 'manifest.json' || rel.endsWith('/manifest.json')) {
      const manifest = JSON.parse(content.toString('utf8'))
      delete manifest.signature
      delete manifest.signedAt
      content = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    }

    hmac.update(rel)
    hmac.update('\0')
    hmac.update(content)
  }

  return hmac.digest('base64')
}

/**
 * 对插件包目录进行签名。
 * 签名基于目录文件内容（非 tgz 字节），保证确定性。
 * 不修改源目录，签名直接写入输出 tgz。
 */
export function signPluginPack(packDir: string, outFile: string, key: string): PluginPackManifest {
  const resolved = path.resolve(packDir)
  const manifest = validatePackDirectory(resolved)
  const signature = computeDirectorySignature(resolved, key)
  const signedAt = new Date().toISOString()

  // 创建临时目录，复制内容并写入签名
  const tmpDir = path.join(tmpdir(), `plugin-sign-${Date.now()}`)
  const tmpPackDir = path.join(tmpDir, path.basename(resolved))
  cpSync(resolved, tmpPackDir, { recursive: true })
  try {
    const manifestPath = path.join(tmpPackDir, 'manifest.json')
    const manifestData = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifestData.signature = signature
    manifestData.signedAt = signedAt
    writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2) + '\n')

    // 打包临时目录
    mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
    execSync(`tar -czf ${JSON.stringify(path.resolve(outFile))} -C ${JSON.stringify(tmpDir)} ${JSON.stringify(path.basename(tmpPackDir))}`, {
      stdio: 'inherit',
    })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  return { ...manifest, signature, signedAt }
}

export interface SignatureVerificationResult {
  valid: boolean
  reason?: 'mismatch' | 'expired' | 'missing'
  signature?: string
  signedAt?: string
}

/**
 * 验证插件包签名。
 *
 * 流程：
 * 1. 解压 tgz
 * 2. 读取 manifest.json 中的 signature / signedAt
 * 3. 基于目录文件内容重新计算 HMAC（排除 signature / signedAt）
 * 4. 比对签名
 * 5. 检查 signedAt 是否在有效时间窗口内
 */
export function verifyPluginSignature(
  archivePath: string,
  key: string,
  opts?: { maxAgeMs?: number },
): SignatureVerificationResult {
  const maxAge = opts?.maxAgeMs ?? SIGNATURE_MAX_AGE_MS
  const tempRoot = path.join(tmpdir(), `plugin-verify-${Date.now()}`)
  mkdirSync(tempRoot, { recursive: true })

  try {
    const packDir = extractPluginArchive(archivePath, tempRoot)
    const manifestPath = path.join(packDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      return { valid: false, reason: 'missing' }
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginPackManifest
    if (!manifest.signature || !manifest.signedAt) {
      return { valid: false, reason: 'missing', signature: manifest.signature, signedAt: manifest.signedAt }
    }

    const expectedSig = manifest.signature
    const signedAt = manifest.signedAt

    // 基于目录内容计算签名（自动排除 signature / signedAt）
    const computedSig = computeDirectorySignature(packDir, key)
    if (computedSig !== expectedSig) {
      return { valid: false, reason: 'mismatch', signature: expectedSig, signedAt }
    }

    // 检查时间窗口
    const signTime = new Date(signedAt).getTime()
    if (Date.now() - signTime > maxAge) {
      return { valid: false, reason: 'expired', signature: expectedSig, signedAt }
    }

    return { valid: true, signature: expectedSig, signedAt }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

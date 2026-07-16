import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  packPluginDirectory,
  signPluginPack,
  verifyPluginSignature,
  computeDirectorySignature,
  extractPluginArchive,
  validatePackManifest,
  readPackManifest,
} from './pluginPack.js'

function createTestPackDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
  mkdirSync(path.join(dir, 'tools'), { recursive: true })
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      id: 'test.pack',
      name: 'Test Pack',
      version: '1.0.0',
      description: 'A test plugin pack',
    }, null, 2) + '\n',
  )
  writeFileSync(
    path.join(dir, 'tools', 'test-tool.json'),
    JSON.stringify({
      name: 'test-tool',
      kind: 'http',
      label: 'Test Tool',
      category: 'mcp-industry',
    }, null, 2),
  )
}

describe('pluginPack', () => {
  let testDir: string

  beforeEach(() => {
    testDir = path.join(tmpdir(), `plugin-pack-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('validatePackManifest', () => {
    it('accepts valid manifest', () => {
      expect(() =>
        validatePackManifest({ id: 'a.b', name: 'A', version: '1.0.0' }),
      ).not.toThrow()
    })

    it('rejects missing id', () => {
      expect(() =>
        validatePackManifest({ id: '', name: 'A', version: '1.0.0' }),
      ).toThrow('manifest.id is required')
    })

    it('rejects missing name', () => {
      expect(() =>
        validatePackManifest({ id: 'a.b', name: '', version: '1.0.0' }),
      ).toThrow('manifest.name is required')
    })

    it('rejects missing version', () => {
      expect(() =>
        validatePackManifest({ id: 'a.b', name: 'A', version: '' }),
      ).toThrow('manifest.version is required')
    })
  })

  describe('readPackManifest', () => {
    it('reads and validates manifest from directory', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const manifest = readPackManifest(packDir)
      expect(manifest.id).toBe('test.pack')
      expect(manifest.name).toBe('Test Pack')
    })

    it('throws when manifest.json is missing', () => {
      mkdirSync(path.join(testDir, 'empty'))
      expect(() => readPackManifest(path.join(testDir, 'empty'))).toThrow('missing manifest.json')
    })
  })

  describe('packPluginDirectory', () => {
    it('packs a plugin directory into .tgz', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'out.tgz')
      const manifest = packPluginDirectory(packDir, outFile)
      expect(manifest.id).toBe('test.pack')
      expect(existsSync(outFile)).toBe(true)
    })
  })

  describe('extractPluginArchive', () => {
    it('extracts a .tgz archive', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'out.tgz')
      packPluginDirectory(packDir, outFile)

      const extractDir = path.join(testDir, 'extracted')
      const extractedPackDir = extractPluginArchive(outFile, extractDir)
      expect(existsSync(path.join(extractedPackDir, 'manifest.json'))).toBe(true)
      expect(existsSync(path.join(extractedPackDir, 'tools', 'test-tool.json'))).toBe(true)
    })
  })

  describe('computeDirectorySignature', () => {
    it('produces deterministic HMAC-SHA256', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const sig1 = computeDirectorySignature(packDir, 'secret-key')
      const sig2 = computeDirectorySignature(packDir, 'secret-key')
      expect(sig1).toBe(sig2)
      expect(sig1).toMatch(/^[A-Za-z0-9+/=]+$/)
    })

    it('produces different signatures for different keys', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const sig1 = computeDirectorySignature(packDir, 'key-a')
      const sig2 = computeDirectorySignature(packDir, 'key-b')
      expect(sig1).not.toBe(sig2)
    })

    it('produces different signatures for different content', () => {
      const dirA = path.join(testDir, 'plugin-a')
      const dirB = path.join(testDir, 'plugin-b')
      createTestPackDir(dirA)
      createTestPackDir(dirB)
      // Modify dirB's tool content
      writeFileSync(
        path.join(dirB, 'tools', 'test-tool.json'),
        JSON.stringify({ name: 'modified-tool', kind: 'http' }),
      )
      const sig1 = computeDirectorySignature(dirA, 'same-key')
      const sig2 = computeDirectorySignature(dirB, 'same-key')
      expect(sig1).not.toBe(sig2)
    })

    it('ignores signature and signedAt fields in manifest', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const sigBefore = computeDirectorySignature(packDir, 'key')

      // Add signature fields to manifest
      const manifestPath = path.join(packDir, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      manifest.signature = 'fake-sig'
      manifest.signedAt = '2026-01-01T00:00:00.000Z'
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

      const sigAfter = computeDirectorySignature(packDir, 'key')
      expect(sigBefore).toBe(sigAfter)
    })
  })

  describe('signPluginPack', () => {
    it('signs a pack and writes signature to manifest in tgz', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'signed.tgz')

      const manifest = signPluginPack(packDir, outFile, 'test-key')

      expect(manifest.signature).toBeDefined()
      expect(manifest.signedAt).toBeDefined()
      expect(existsSync(outFile)).toBe(true)

      // Verify the source directory is NOT modified
      const srcManifest = JSON.parse(readFileSync(path.join(packDir, 'manifest.json'), 'utf8'))
      expect(srcManifest.signature).toBeUndefined()
      expect(srcManifest.signedAt).toBeUndefined()

      // Verify the manifest inside the tgz has signature
      const extractDir = path.join(testDir, 'verify-extract')
      const extractedPackDir = extractPluginArchive(outFile, extractDir)
      const rawManifest = JSON.parse(readFileSync(path.join(extractedPackDir, 'manifest.json'), 'utf8'))
      expect(rawManifest.signature).toBe(manifest.signature)
      expect(rawManifest.signedAt).toBe(manifest.signedAt)
    })
  })

  describe('verifyPluginSignature', () => {
    it('verifies a valid signed pack', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'signed.tgz')
      signPluginPack(packDir, outFile, 'test-key')

      const result = verifyPluginSignature(outFile, 'test-key')
      expect(result.valid).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('rejects signature with wrong key', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'signed.tgz')
      signPluginPack(packDir, outFile, 'correct-key')

      const result = verifyPluginSignature(outFile, 'wrong-key')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('mismatch')
    })

    it('rejects unsigned pack as missing', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'unsigned.tgz')
      packPluginDirectory(packDir, outFile)

      const result = verifyPluginSignature(outFile, 'any-key')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('missing')
    })

    it('rejects expired signature', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'signed.tgz')

      // Sign first
      const manifest = signPluginPack(packDir, outFile, 'test-key')

      // Extract, modify signedAt to 91 days ago, re-pack
      const extractDir = path.join(testDir, 'temp-extract')
      const extractedPackDir = extractPluginArchive(outFile, extractDir)
      const manifestPath = path.join(extractedPackDir, 'manifest.json')
      const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      rawManifest.signedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString()
      writeFileSync(manifestPath, JSON.stringify(rawManifest, null, 2) + '\n')

      // Re-pack with modified signedAt (signature stays valid, just expired)
      // execSync imported at top
      const parent = path.dirname(extractedPackDir)
      const base = path.basename(extractedPackDir)
      execSync(`tar -czf ${JSON.stringify(outFile)} -C ${JSON.stringify(parent)} ${JSON.stringify(base)}`)

      const result = verifyPluginSignature(outFile, 'test-key')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('expired')
    })

    it('detects tampered content', () => {
      const packDir = path.join(testDir, 'my-plugin')
      createTestPackDir(packDir)
      const outFile = path.join(testDir, 'signed.tgz')
      signPluginPack(packDir, outFile, 'test-key')

      // Tamper: extract, modify a tool file, re-pack
      const extractDir = path.join(testDir, 'tamper-extract')
      const extractedPackDir = extractPluginArchive(outFile, extractDir)
      writeFileSync(
        path.join(extractedPackDir, 'tools', 'test-tool.json'),
        JSON.stringify({ name: 'tampered', kind: 'http', label: 'Tampered' }),
      )

      // execSync imported at top
      const parent = path.dirname(extractedPackDir)
      const base = path.basename(extractedPackDir)
      execSync(`tar -czf ${JSON.stringify(outFile)} -C ${JSON.stringify(parent)} ${JSON.stringify(base)}`)

      const result = verifyPluginSignature(outFile, 'test-key')
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('mismatch')
    })
  })
})

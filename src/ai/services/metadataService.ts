/**
 * Metadata 与文本工具函数 — 纯逻辑，无副作用。
 *
 * 从 toolHandlers.ts 抽出，供 service 层和 toolHandlers 共用，避免循环依赖。
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { AIMetadata } from '@schema-platform/platform-shared/ai'

const require = createRequire(fileURLToPath(import.meta.url))

// ────────────────────────────────────────────
// Metadata 加载（单一入口）
// ────────────────────────────────────────────

let _metadata: AIMetadata | null = null

export function getMetadata(): AIMetadata {
  if (!_metadata) {
    const pkgPath = require.resolve('@schema-platform/platform-shared/ai/package.json')
    const jsonPath = join(dirname(pkgPath), 'metadata.json')
    _metadata = JSON.parse(readFileSync(jsonPath, 'utf-8')) as AIMetadata
  }
  return _metadata
}

// ────────────────────────────────────────────
// Token extraction（模糊搜索用）
// ────────────────────────────────────────────

export function extractTokens(text: string): Set<string> {
  const tokens = new Set<string>()
  const englishWords = text.match(/[a-zA-Z]+/g) ?? []
  for (const word of englishWords) tokens.add(word.toLowerCase())
  const chineseChars = text.match(/[一-鿿]+/g) ?? []
  for (const segment of chineseChars) {
    for (let i = 0; i < segment.length - 1; i++) tokens.add(segment.slice(i, i + 2))
    if (segment.length > 0) tokens.add(segment)
  }
  return tokens
}

export function extractTokensFromSchema(json: unknown): Set<string> {
  const tokens = new Set<string>()
  if (!Array.isArray(json)) return tokens
  function walk(nodes: Record<string, unknown>[]): void {
    for (const node of nodes) {
      if (node.type) tokens.add(String(node.type))
      if (node.field) tokens.add(String(node.field))
      if (node.label) { for (const t of extractTokens(String(node.label))) tokens.add(t) }
      if (Array.isArray(node.children)) walk(node.children as Record<string, unknown>[])
    }
  }
  walk(json as Record<string, unknown>[])
  return tokens
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) { if (b.has(item)) intersection++ }
  return intersection / (a.size + b.size - intersection)
}

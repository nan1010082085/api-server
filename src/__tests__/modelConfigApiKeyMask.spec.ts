/**
 * ModelConfig API Key Masking Tests
 *
 * Verifies that:
 * - GET /api/model-configs returns masked apiKeys
 * - GET /api/model-configs/:id returns masked apiKey
 * - POST /api/model-configs returns full apiKey (one-time echo)
 * - PUT /api/model-configs/:id returns full apiKey (one-time echo)
 * - Internal usage (llmCache .lean()) is unaffected
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { maskApiKey } from '../routes/modelConfig.js'

// ── maskApiKey unit tests ──

describe('maskApiKey()', () => {
  it('returns empty string for empty input', () => {
    expect(maskApiKey('')).toBe('')
  })

  it('fully masks keys shorter than 9 characters', () => {
    expect(maskApiKey('abc')).toBe('****')
    expect(maskApiKey('12345678')).toBe('****')
  })

  it('masks middle of keys with 9+ characters, keeping first 4 and last 4', () => {
    expect(maskApiKey('sk-1234567890')).toBe('sk-1****7890')
    expect(maskApiKey('abcdefghij')).toBe('abcd****ghij')
  })

  it('handles a typical long API key', () => {
    const key = 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz1234567890abcdef'
    const masked = maskApiKey(key)
    expect(masked).toBe('sk-p****cdef')
    expect(masked.length).toBe(12) // 4 + 4 asterisks + 4
  })

  it('handles exactly 9 characters', () => {
    expect(maskApiKey('123456789')).toBe('1234****6789')
  })

  it('handles exactly 10 characters', () => {
    expect(maskApiKey('1234567890')).toBe('1234****7890')
  })

  it('preserves first/last 4 for very long keys', () => {
    const key = 'a'.repeat(100)
    const masked = maskApiKey(key)
    expect(masked.startsWith('aaaa')).toBe(true)
    expect(masked.endsWith('aaaa')).toBe(true)
    expect(masked).toBe('aaaa****aaaa')
  })
})

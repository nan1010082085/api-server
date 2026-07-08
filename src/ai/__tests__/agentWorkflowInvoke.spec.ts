import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateInvokeKey,
  maskInvokeKey,
  verifyWorkflowInvokeKey,
  verifyApiKeyLookup,
  readApiKeyFromContext,
  API_KEY_HEADER,
} from '../services/agentWorkflowInvoke.js'

// Mock ApiKeyModel
const mockFindOne = vi.fn()
const mockUpdateOne = vi.fn(() => ({ exec: vi.fn() }))

vi.mock('../../models/ApiKey.js', () => ({
  ApiKeyModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}))

describe('agentWorkflowInvoke', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('generateInvokeKey returns wf_ prefix hex', () => {
    const key = generateInvokeKey()
    expect(key.startsWith('wf_')).toBe(true)
    expect(key.length).toBeGreaterThan(20)
  })

  it('maskInvokeKey hides middle segment', () => {
    const masked = maskInvokeKey('wf_abcdef1234567890abcdef12')
    expect(masked).toContain('****')
    expect(masked.startsWith('wf_abcde')).toBe(true)
  })

  it('verifyWorkflowInvokeKey uses timing-safe compare', () => {
    const key = generateInvokeKey()
    expect(verifyWorkflowInvokeKey(key, key)).toBe(true)
    expect(verifyWorkflowInvokeKey(key, `${key}x`)).toBe(false)
    expect(verifyWorkflowInvokeKey(undefined, key)).toBe(false)
  })

  describe('verifyApiKeyLookup', () => {
    it('returns null when apiKey is undefined', async () => {
      const result = await verifyApiKeyLookup(undefined)
      expect(result).toBeNull()
    })

    it('returns null when apiKey is empty', async () => {
      const result = await verifyApiKeyLookup('')
      expect(result).toBeNull()
    })

    it('returns null when key not found in DB', async () => {
      mockFindOne.mockResolvedValue(null)
      const result = await verifyApiKeyLookup('sk-nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when key is disabled', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id1',
        key: 'sk-disabled',
        status: 'disabled',
        tenantId: '000000',
        createdBy: 'user1',
        expiresAt: null,
      })
      const result = await verifyApiKeyLookup('sk-disabled')
      expect(result).toBeNull()
    })

    it('returns null when key is expired', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id1',
        key: 'sk-expired',
        status: 'active',
        tenantId: '000000',
        createdBy: 'user1',
        expiresAt: new Date('2020-01-01'),
      })
      const result = await verifyApiKeyLookup('sk-expired')
      expect(result).toBeNull()
    })

    it('returns null when tenantId mismatches', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id1',
        key: 'sk-valid',
        status: 'active',
        tenantId: 'tenant-a',
        createdBy: 'user1',
        expiresAt: null,
      })
      const result = await verifyApiKeyLookup('sk-valid', 'tenant-b')
      expect(result).toBeNull()
    })

    it('returns record for valid active key with matching tenant', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id1',
        key: 'sk-valid',
        status: 'active',
        tenantId: '000000',
        createdBy: 'user1',
        expiresAt: null,
      })
      const result = await verifyApiKeyLookup('sk-valid', '000000')
      expect(result).toEqual({ tenantId: '000000', createdBy: 'user1' })
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'id1' },
        { lastUsedAt: expect.any(Date) },
      )
    })

    it('returns record for valid active key with future expiration', async () => {
      const futureDate = new Date(Date.now() + 86400000)
      mockFindOne.mockResolvedValue({
        _id: 'id2',
        key: 'sk-not-expired',
        status: 'active',
        tenantId: '000000',
        createdBy: 'user2',
        expiresAt: futureDate,
      })
      const result = await verifyApiKeyLookup('sk-not-expired')
      expect(result).toEqual({ tenantId: '000000', createdBy: 'user2' })
    })

    it('skips tenantId check when not provided', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id3',
        key: 'sk-any-tenant',
        status: 'active',
        tenantId: 'tenant-x',
        createdBy: 'user3',
        expiresAt: null,
      })
      const result = await verifyApiKeyLookup('sk-any-tenant')
      expect(result).toEqual({ tenantId: 'tenant-x', createdBy: 'user3' })
    })

    it('trims whitespace from key', async () => {
      mockFindOne.mockResolvedValue({
        _id: 'id4',
        key: 'sk-trimmed',
        status: 'active',
        tenantId: '000000',
        createdBy: 'user4',
        expiresAt: null,
      })
      const result = await verifyApiKeyLookup('  sk-trimmed  ')
      expect(mockFindOne).toHaveBeenCalledWith({ key: 'sk-trimmed' })
      expect(result).toEqual({ tenantId: '000000', createdBy: 'user4' })
    })
  })

  describe('readApiKeyFromContext', () => {
    it('returns X-API-Key header value', () => {
      const ctx = { get: (name: string) => name === API_KEY_HEADER ? 'sk-abc123' : '' }
      expect(readApiKeyFromContext(ctx as never)).toBe('sk-abc123')
    })

    it('returns undefined when header is empty', () => {
      const ctx = { get: () => '' }
      expect(readApiKeyFromContext(ctx as never)).toBeUndefined()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateInvokeKey,
  maskInvokeKey,
  verifyWorkflowInvokeKey,
  verifyApiKeyLookup,
  readApiKeyFromContext,
  API_KEY_HEADER,
  WORKFLOW_EXECUTE_PERMISSION,
} from '../services/agentWorkflowInvoke.js'

// Mock ApiKeyModel
const mockFindOne = vi.fn()
const mockExec = vi.fn().mockResolvedValue({})
const mockUpdateOne = vi.fn(() => ({ exec: mockExec }))

vi.mock('../../models/ApiKey.js', () => ({
  ApiKeyModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}))

const validKeyRecord = {
  _id: 'id1',
  key: 'sk-valid',
  name: 'test-key',
  status: 'active',
  tenantId: '000000',
  createdBy: 'user1',
  expiresAt: null,
  permissions: [WORKFLOW_EXECUTE_PERMISSION],
}

describe('agentWorkflowInvoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExec.mockResolvedValue({})
    mockUpdateOne.mockImplementation(() => ({ exec: mockExec }))
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
        ...validKeyRecord,
        key: 'sk-disabled',
        status: 'disabled',
      })
      const result = await verifyApiKeyLookup('sk-disabled')
      expect(result).toBeNull()
    })

    it('returns null when key is expired', async () => {
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        key: 'sk-expired',
        expiresAt: new Date('2020-01-01'),
      })
      const result = await verifyApiKeyLookup('sk-expired')
      expect(result).toBeNull()
    })

    it('returns null when tenantId mismatches', async () => {
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        tenantId: 'tenant-a',
      })
      const result = await verifyApiKeyLookup('sk-valid', 'tenant-b')
      expect(result).toBeNull()
    })

    it('returns null when key lacks workflow:execute permission', async () => {
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        permissions: ['other:read'],
      })
      const result = await verifyApiKeyLookup('sk-valid', '000000')
      expect(result).toBeNull()
    })

    it('returns record for valid active key with matching tenant', async () => {
      mockFindOne.mockResolvedValue(validKeyRecord)
      const result = await verifyApiKeyLookup('sk-valid', '000000')
      expect(result).toEqual({
        tenantId: '000000',
        createdBy: 'user1',
        keyId: 'id1',
        keyName: 'test-key',
      })
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'id1' },
        { lastUsedAt: expect.any(Date) },
      )
    })

    it('returns record for valid active key with future expiration', async () => {
      const futureDate = new Date(Date.now() + 86400000)
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        _id: 'id2',
        key: 'sk-not-expired',
        createdBy: 'user2',
        expiresAt: futureDate,
      })
      const result = await verifyApiKeyLookup('sk-not-expired')
      expect(result).toEqual({
        tenantId: '000000',
        createdBy: 'user2',
        keyId: 'id2',
        keyName: 'test-key',
      })
    })

    it('skips tenantId check when not provided', async () => {
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        _id: 'id3',
        key: 'sk-any-tenant',
        tenantId: 'tenant-x',
        createdBy: 'user3',
      })
      const result = await verifyApiKeyLookup('sk-any-tenant')
      expect(result).toEqual({
        tenantId: 'tenant-x',
        createdBy: 'user3',
        keyId: 'id3',
        keyName: 'test-key',
      })
    })

    it('trims whitespace from key', async () => {
      mockFindOne.mockResolvedValue({
        ...validKeyRecord,
        _id: 'id4',
        key: 'sk-trimmed',
        createdBy: 'user4',
      })
      const result = await verifyApiKeyLookup('  sk-trimmed  ')
      expect(mockFindOne).toHaveBeenCalledWith({ key: 'sk-trimmed' })
      expect(result).toEqual({
        tenantId: '000000',
        createdBy: 'user4',
        keyId: 'id4',
        keyName: 'test-key',
      })
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

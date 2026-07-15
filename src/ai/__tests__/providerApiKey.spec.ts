import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/credentialService.js', () => ({
  encrypt: (data: Record<string, string>) => `enc:${data.apiKey}`,
  decrypt: (raw: string) => {
    if (!raw.startsWith('enc:')) throw new Error('not encrypted')
    return { apiKey: raw.slice(4) }
  },
}))

describe('Provider apiKey helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('resolveStoredProviderApiKey decrypts encrypted blobs', async () => {
    const { resolveStoredProviderApiKey } = await import('../../models/Provider.js')
    expect(resolveStoredProviderApiKey('enc:sk-secret')).toBe('sk-secret')
  })

  it('resolveStoredProviderApiKey keeps plaintext keys', async () => {
    const { resolveStoredProviderApiKey } = await import('../../models/Provider.js')
    expect(resolveStoredProviderApiKey('sk-plaintext')).toBe('sk-plaintext')
  })

  it('getProviderProbeModel returns provider-specific models', async () => {
    const { getProviderProbeModel } = await import('../../models/Provider.js')
    expect(getProviderProbeModel('deepseek')).toBe('deepseek-v4-flash')
    expect(getProviderProbeModel('mimo')).toBe('mimo-v2.5')
    expect(getProviderProbeModel('openai')).toBe('gpt-4o-mini')
  })
})

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

  it('resolveStoredProviderApiKey returns empty for undecryptable ciphertext (wrong secret)', async () => {
    // 密文（非 sk-/tp- 前缀，长度 >= 50）解不开时返回空，
    // 让调用方走 env fallback，避免拿密文当 key 调上游导致 401
    const { resolveStoredProviderApiKey } = await import('../../models/Provider.js')
    const bogusBlob = 'a'.repeat(80)
    expect(resolveStoredProviderApiKey(bogusBlob)).toBe('')
  })

  it('resolveStoredProviderApiKey returns short non-prefixed plaintext as-is', async () => {
    // custom provider 的短明文 key（< 50 字符）不应被误判为密文
    const { resolveStoredProviderApiKey } = await import('../../models/Provider.js')
    expect(resolveStoredProviderApiKey('my-custom-key')).toBe('my-custom-key')
  })

  it('getProviderProbeModel returns provider-specific models', async () => {
    const { getProviderProbeModel } = await import('../../models/Provider.js')
    expect(getProviderProbeModel('deepseek')).toBe('deepseek-v4-flash')
    expect(getProviderProbeModel('mimo')).toBe('mimo-v2.5')
    expect(getProviderProbeModel('openai')).toBe('gpt-4o-mini')
  })
})

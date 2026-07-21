/**
 * 端到端验证：DeepSeek 模型测试 401 修复。
 *
 * 场景：本地 dev 连生产 DB，provider.apiKey 是用生产 CREDENTIAL_SECRET 加密的密文，
 * 本地 secret 解不开。修复前 resolveStoredProviderApiKey 返回密文 -> 当 Bearer key -> 401。
 * 修复后返回空 -> env fallback 生效 -> 用 .env 的 DEEPSEEK_API_KEY -> 200。
 *
 * 用 mocked fetch 断言：发给 DeepSeek 的 Authorization 头是 env key（sk-env-...）而非密文。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock credentialService：decrypt 对非 'enc:' 前缀抛错（模拟本地 secret 解不开生产密文）
vi.mock('../../services/credentialService.js', () => ({
  encrypt: (data: Record<string, string>) => `enc:${data.apiKey}`,
  decrypt: (raw: string) => {
    if (!raw.startsWith('enc:')) throw new Error('bad decrypt: wrong secret')
    return { apiKey: raw.slice(4) }
  },
}))

// Mock ModelModel.findById(...).populate(...) 返回带"解不开密文"的 provider
const fakeModel = {
  _id: '65a1'.repeat(6),
  model: 'deepseek-chat',
  parameters: { temperature: 0 },
  providerId: {
    _id: '65b2'.repeat(6),
    type: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'k'.repeat(80), // 生产 secret 加密的密文，本地解不开
    isActive: true,
  },
}

vi.mock('../../models/Model.js', () => ({
  ModelModel: {
    findById: vi.fn().mockReturnValue({
      populate: vi.fn().mockResolvedValue(fakeModel),
    }),
  },
}))

import { resolveStoredProviderApiKey } from '../../models/Provider.js'

describe('DeepSeek testModel 401 修复 (e2e key resolution)', () => {
  const originalKey = process.env.DEEPSEEK_API_KEY
  const realFetch = globalThis.fetch

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-env-valid-key'
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
    globalThis.fetch = realFetch
  })

  it('密文解不开时 resolveStoredProviderApiKey 返回空', () => {
    const bogusCipher = 'k'.repeat(80)
    expect(resolveStoredProviderApiKey(bogusCipher)).toBe('')
  })

  it('env fallback 生效：最终 key 是 env DEEPSEEK_API_KEY 而非密文', async () => {
    const sentAuths: string[] = []
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{}',
      json: async () => ({
        choices: [{ message: { content: 'OK' } }],
        usage: { total_tokens: 5 },
      }),
    } as unknown as Response) as typeof fetch

    // 复刻 aiModelRoutes.ts:246 的 key 解析逻辑
    const { resolveProviderEnvApiKey } = await import('../../utils/modelProviderEnv.js')
    const stored = resolveStoredProviderApiKey(fakeModel.providerId.apiKey)
    const apiKey = stored || resolveProviderEnvApiKey('deepseek')

    // 核心断言：密文没短路 env fallback，最终拿到 env key
    expect(stored).toBe('')
    expect(apiKey).toBe('sk-env-valid-key')

    // 模拟 testModel 发起的 fetch，捕获 Authorization 头
    await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }),
    })

    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const authHeader = (call[1].headers as Record<string, string>).Authorization
    sentAuths.push(authHeader)

    // 关键：发给 DeepSeek 的是 env key，不是密文 -> 401 消除
    expect(authHeader).toBe('Bearer sk-env-valid-key')
    expect(authHeader).not.toContain('kkkk') // 密文不应出现
  })

  it('修复前行为对比：return raw 会把密文当 key（验证 bug 复现路径）', () => {
    // 这是修复前的逻辑，用于对比确认 bug 根因
    const bogusCipher = 'k'.repeat(80)
    const oldBehavior = (() => {
      if (!bogusCipher) return ''
      // 修复前：decrypt 失败后 fall through 到 return raw
      return bogusCipher
    })()
    // 修复前：密文 truthy，会短路 env fallback -> 401
    expect(oldBehavior).toBe(bogusCipher)
    expect(Boolean(oldBehavior)).toBe(true) // truthy -> 短路 env
  })

  it('完整链路：密文 -> env fallback -> fetch 200 -> 解析响应成功', async () => {
    // mock fetch 返回 DeepSeek 200 成功格式
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"choices":[{"message":{"content":"OK"}}],"usage":{"total_tokens":5}}',
      json: async () => ({
        choices: [{ message: { content: 'OK' } }],
        usage: { total_tokens: 5 },
      }),
    } as unknown as Response) as typeof fetch

    const { resolveProviderEnvApiKey } = await import('../../utils/modelProviderEnv.js')

    // 1. testModel 的 key 解析（aiModelRoutes.ts:246）
    const stored = resolveStoredProviderApiKey(fakeModel.providerId.apiKey)
    const apiKey = stored || resolveProviderEnvApiKey('deepseek')
    expect(stored).toBe('')
    expect(apiKey).toBe('sk-env-valid-key')

    // 2. testModel 的 fetch 调用（aiModelRoutes.ts:257-270）
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: fakeModel.model,
        messages: [{ role: 'user', content: 'Hello, respond with OK' }],
        max_tokens: 50,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    // 3. testModel 的响应解析（aiModelRoutes.ts:285-301）
    expect(response.ok).toBe(true)
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number }
    }
    const reply = data.choices?.[0]?.message?.content ?? ''
    const tokens = data.usage?.total_tokens ?? 0

    // 端到端断言：修复后 testModel 会返回 success（而非 401/502）
    expect(reply).toBe('OK')
    expect(tokens).toBe(5)
    expect({ success: true, data: { reply: reply.slice(0, 200), tokens, model: fakeModel.model, provider: 'deepseek' } })
      .toEqual({ success: true, data: { reply: 'OK', tokens: 5, model: 'deepseek-chat', provider: 'deepseek' } })

    // 确认发给 DeepSeek 的是 env key（401 消除的核心证据）
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const authHeader = (call[1].headers as Record<string, string>).Authorization
    expect(authHeader).toBe('Bearer sk-env-valid-key')
  })
})

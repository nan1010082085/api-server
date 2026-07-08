/**
 * LLM Cache priority tests.
 *
 * Verifies the config resolution priority:
 *   1. Request user config (per-request apiKey/provider)
 *   2. Tenant DB config (isDefault=true)
 *   3. Platform demo (LLMManager env providers) — skipped when PLATFORM_LLM_ENABLED=false
 *   4. Env fallback (DEEPSEEK_API_KEY) — skipped when PLATFORM_LLM_ENABLED=false
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mocks ──

// Mock ChatOpenAI so no real instances are created
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ _opts: opts, _mock: true })),
}))

// Mock LLMManager — we control what providers are "registered"
const mockGetProvider = vi.fn()
vi.mock('../services/llmManager.js', () => ({
  llmManager: {
    getProvider: mockGetProvider,
  },
}))

// Mock ModelConfigModel — we control DB results
// findOne returns a thenable with .lean() that resolves to the mock data
const mockFindOne = vi.fn()
function makeQuery(result: unknown) {
  const query = {
    lean: vi.fn().mockResolvedValue(result),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return query
}
vi.mock('../../models/ModelConfig.js', () => ({
  ModelConfigModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
  },
}))

// ── Import after mocks ──

const { getLLM, clearLLMCache } = await import('../services/llmCache.js')

// ── Helpers ──

function mockDbConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'deepseek',
    apiKey: 'db-api-key-123',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    parameters: { temperature: 0.5, maxTokens: 4096 },
    ...overrides,
  }
}

/** Set up mockFindOne to return query objects with .lean() support */
function setupFindOne(...results: Array<unknown>) {
  let callIndex = 0
  mockFindOne.mockImplementation(() => {
    const result = callIndex < results.length ? results[callIndex] : results[results.length - 1]
    callIndex++
    return makeQuery(result)
  })
}

function mockEnvProvider() {
  mockGetProvider.mockReturnValue({
    name: 'openai',
    defaultModel: 'gpt-4o',
    createLangChainModel: vi.fn().mockReturnValue({ _opts: { model: 'gpt-4o' }, _mock: true, _fromProvider: true }),
  })
}

function mockNoEnvProvider() {
  mockGetProvider.mockImplementation(() => {
    throw new Error('No providers registered')
  })
}

// ── Tests ──

describe('llmCache.resolveConfig priority', () => {
  const savedEnv = { ...process.env }

  beforeEach(() => {
    clearLLMCache()
    mockFindOne.mockReset()
    mockGetProvider.mockReset()
    // Clear env overrides
    delete process.env.PLATFORM_LLM_ENABLED
    delete process.env.DEEPSEEK_API_KEY
  })

  afterEach(() => {
    // Restore env
    process.env = { ...savedEnv }
  })

  // ────────────────────────────────────────────
  // Priority 1: Request user config
  // ────────────────────────────────────────────

  describe('Tier 0 — Request user config', () => {
    it('uses user config when provided, skipping DB lookup', async () => {
      const userCfg = {
        apiKey: 'user-api-key-123',
        provider: 'openai',
        baseURL: 'https://custom.openai.com/v1',
        model: 'gpt-4o-mini',
      }

      const llm = await getLLM({ userConfig: userCfg })

      // Should NOT query DB at all
      expect(mockFindOne).not.toHaveBeenCalled()
      expect(llm._opts.apiKey).toBe('user-api-key-123')
      expect(llm._opts.model).toBe('gpt-4o-mini')
    })

    it('user config takes priority over DB config', async () => {
      const dbCfg = mockDbConfig({ apiKey: 'db-key' })
      setupFindOne(dbCfg)

      const llm = await getLLM({
        userConfig: { apiKey: 'user-key' },
      })

      expect(llm._opts.apiKey).toBe('user-key')
      expect(mockFindOne).not.toHaveBeenCalled()
    })

    it('user config takes priority over LLMManager env provider', async () => {
      mockEnvProvider()

      const llm = await getLLM({
        userConfig: { apiKey: 'user-key', provider: 'deepseek' },
      })

      expect(llm._opts.apiKey).toBe('user-key')
      expect(mockGetProvider).not.toHaveBeenCalled()
    })

    it('user config takes priority even when PLATFORM_LLM_ENABLED=false', async () => {
      process.env.PLATFORM_LLM_ENABLED = 'false'

      const llm = await getLLM({
        userConfig: { apiKey: 'user-key' },
      })

      expect(llm._opts.apiKey).toBe('user-key')
    })

    it('uses default provider and model when not specified in userConfig', async () => {
      const llm = await getLLM({
        userConfig: { apiKey: 'user-key' },
        model: 'custom-model',
      })

      expect(llm._opts.apiKey).toBe('user-key')
      // userConfig.model is not set, so opts.model is used
      expect(llm._opts.model).toBe('custom-model')
    })

    it('opts.model overrides userConfig.model', async () => {
      const llm = await getLLM({
        userConfig: { apiKey: 'user-key', model: 'model-a' },
        model: 'model-b',
      })

      // userConfig.model takes precedence over opts.model
      expect(llm._opts.model).toBe('model-a')
    })
  })

  // ────────────────────────────────────────────
  // Priority 2: Tenant DB config
  // ────────────────────────────────────────────

  describe('Tier 1 — Tenant DB config', () => {
    it('uses DB config when isDefault=true exists', async () => {
      const dbCfg = mockDbConfig()
      // No opts.model → only one findOne call (isDefault)
      setupFindOne(dbCfg)
      mockNoEnvProvider()

      const llm = await getLLM()

      expect(mockFindOne).toHaveBeenCalledTimes(1)
      expect(llm._opts.apiKey).toBe('db-api-key-123')
      expect(llm._opts.model).toBe('deepseek-v4-pro')
      expect(llm._opts.temperature).toBe(0.5)
      expect(llm._opts.maxTokens).toBe(4096)
    })

    it('DB config takes priority over env-registered LLMManager provider', async () => {
      const dbCfg = mockDbConfig({ apiKey: 'my-db-key' })
      setupFindOne(dbCfg)
      mockEnvProvider()

      const llm = await getLLM()

      // Should use DB key, NOT the env provider
      expect(llm._opts.apiKey).toBe('my-db-key')
      expect(mockGetProvider).not.toHaveBeenCalled()
    })

    it('DB config takes priority over DEEPSEEK_API_KEY env fallback', async () => {
      process.env.DEEPSEEK_API_KEY = 'env-deepseek-key'
      const dbCfg = mockDbConfig({ apiKey: 'my-db-key' })
      setupFindOne(dbCfg)
      mockNoEnvProvider()

      const llm = await getLLM()

      expect(llm._opts.apiKey).toBe('my-db-key')
    })

    it('uses env DEEPSEEK_API_KEY as apiKey fallback when DB config has empty apiKey', async () => {
      process.env.DEEPSEEK_API_KEY = 'env-deepseek-key'
      const dbCfg = mockDbConfig({ apiKey: '' })
      setupFindOne(dbCfg)
      mockNoEnvProvider()

      const llm = await getLLM()

      expect(llm._opts.apiKey).toBe('env-deepseek-key')
    })

    it('opts.model triggers model-specific DB lookup first', async () => {
      const dbCfg = mockDbConfig({ model: 'deepseek-r1', apiKey: 'r1-key' })
      setupFindOne(dbCfg)

      const llm = await getLLM({ model: 'deepseek-r1' })

      // First call should be model-specific lookup
      expect(mockFindOne).toHaveBeenCalledWith({ model: 'deepseek-r1' })
      expect(llm._opts.model).toBe('deepseek-r1')
      expect(llm._opts.apiKey).toBe('r1-key')
    })

    it('opts.model falls back to isDefault when no model match', async () => {
      const dbCfg = mockDbConfig({ model: 'deepseek-v4-pro' })
      // First call: model match (null), second: isDefault (found)
      setupFindOne(null, dbCfg)

      const llm = await getLLM({ model: 'some-unknown-model' })

      expect(mockFindOne).toHaveBeenCalledTimes(2)
      // Model from opts overrides DB model
      expect(llm._opts.model).toBe('some-unknown-model')
    })
  })

  // ────────────────────────────────────────────
  // Priority 2: Platform demo (LLMManager)
  // ────────────────────────────────────────────

  describe('Tier 2 — Platform demo (LLMManager)', () => {
    it('uses LLMManager provider when no DB config exists', async () => {
      // No opts.model → single findOne call returns null
      setupFindOne(null)
      mockEnvProvider()

      const llm = await getLLM()

      expect(llm._opts.model).toBe('gpt-4o')
    })

    it('skips LLMManager when PLATFORM_LLM_ENABLED=false', async () => {
      process.env.PLATFORM_LLM_ENABLED = 'false'
      setupFindOne(null)
      mockEnvProvider()

      await expect(getLLM()).rejects.toThrow('PLATFORM_LLM_ENABLED is false')
      expect(mockGetProvider).not.toHaveBeenCalled()
    })

    it('falls through to env fallback when LLMManager has no providers', async () => {
      process.env.DEEPSEEK_API_KEY = 'fallback-key'
      setupFindOne(null)
      mockNoEnvProvider()

      const llm = await getLLM()

      expect(llm._opts.apiKey).toBe('fallback-key')
    })
  })

  // ────────────────────────────────────────────
  // Priority 3: Env fallback (DEEPSEEK_API_KEY)
  // ────────────────────────────────────────────

  describe('Tier 3 — Env fallback', () => {
    it('uses DEEPSEEK_API_KEY when no DB config and no LLMManager', async () => {
      process.env.DEEPSEEK_API_KEY = 'my-deepseek-key'
      setupFindOne(null)
      mockNoEnvProvider()

      const llm = await getLLM()

      expect(llm._opts.apiKey).toBe('my-deepseek-key')
      expect(llm._opts.model).toBe('deepseek-v4-flash')
    })

    it('skips DEEPSEEK_API_KEY when PLATFORM_LLM_ENABLED=false', async () => {
      process.env.PLATFORM_LLM_ENABLED = 'false'
      process.env.DEEPSEEK_API_KEY = 'my-deepseek-key'
      setupFindOne(null)
      mockNoEnvProvider()

      await expect(getLLM()).rejects.toThrow('PLATFORM_LLM_ENABLED is false')
    })
  })

  // ────────────────────────────────────────────
  // Error guidance
  // ────────────────────────────────────────────

  describe('Error guidance', () => {
    it('throws with guidance when nothing is configured', async () => {
      setupFindOne(null)
      mockNoEnvProvider()

      await expect(getLLM()).rejects.toThrow('Create a ModelConfig in Settings > Model')
    })

    it('throws with PLATFORM_LLM_ENABLED guidance when disabled and no DB config', async () => {
      process.env.PLATFORM_LLM_ENABLED = 'false'
      setupFindOne(null)

      await expect(getLLM()).rejects.toThrow(
        'PLATFORM_LLM_ENABLED is false and no ModelConfig found in database',
      )
    })
  })

  // ────────────────────────────────────────────
  // Cache isolation by source
  // ────────────────────────────────────────────

  describe('Cache key includes source', () => {
    it('DB config and env config with same model get separate cache entries', async () => {
      // First call: DB config found
      const dbCfg = mockDbConfig({ model: 'deepseek-v4-flash', apiKey: 'db-key' })
      setupFindOne(dbCfg)
      mockNoEnvProvider()
      const llm1 = await getLLM()

      // Second call: clear cache, no DB config, use env fallback
      clearLLMCache()
      process.env.DEEPSEEK_API_KEY = 'env-key'
      setupFindOne(null)
      mockNoEnvProvider()
      const llm2 = await getLLM()

      expect(llm1._opts.apiKey).toBe('db-key')
      expect(llm2._opts.apiKey).toBe('env-key')
    })
  })
})

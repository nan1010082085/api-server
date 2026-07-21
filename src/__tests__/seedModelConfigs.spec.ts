import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFindOne = vi.fn()
const mockCreate = vi.fn()
const mockFindByIdAndUpdate = vi.fn()
const mockFindByIdAndDelete = vi.fn()
const mockCountDocuments = vi.fn()
const mockExists = vi.fn()

vi.mock('../models/ModelConfig.js', () => ({
  ModelConfigModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
    findByIdAndDelete: (...args: unknown[]) => mockFindByIdAndDelete(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
    exists: (...args: unknown[]) => mockExists(...args),
  },
}))

vi.mock('../services/credentialService.js', () => ({
  encrypt: vi.fn((data: { apiKey: string }) => `enc:${data.apiKey}`),
}))

describe('ensureModelConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.MIMO_API_KEY
    delete process.env.PLATFORM_LLM_ENABLED
    mockCountDocuments.mockResolvedValue(3)
    mockExists.mockResolvedValue({ _id: '1' })
    mockFindByIdAndDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates deepseek flash/pro and mimo defaults with env api key', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test'
    mockFindOne.mockResolvedValue(null)
    mockCreate.mockResolvedValue({})

    const { ensureModelConfigs } = await import('../utils/seedModelConfigs.js')
    await ensureModelConfigs()

    expect(mockCreate).toHaveBeenCalledTimes(3)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DeepSeek V4 Flash',
        model: 'deepseek-v4-flash',
        isDefault: true,
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DeepSeek V4 Pro',
        model: 'deepseek-v4-pro',
      }),
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mimo v2.5',
        provider: 'mimo',
        model: 'mimo-v2.5',
        baseUrl: 'https://api.xiaomimimo.com/v1',
      }),
    )
  })

  it('syncs empty apiKey from env on existing config', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-sync'
    mockFindOne.mockImplementation(async (query: { name?: string }) => {
      if (query.name === 'DeepSeek V4 Flash') {
        return {
          _id: 'cfg-1',
          name: query.name,
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          apiKey: '',
          baseUrl: 'https://api.deepseek.com',
        }
      }
      return { _id: `other-${query.name}`, apiKey: 'x', baseUrl: 'x', model: 'x' }
    })

    const { ensureModelConfigs } = await import('../utils/seedModelConfigs.js')
    await ensureModelConfigs()

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({ apiKey: 'enc:sk-sync' }),
    )
  })

  it('removes legacy empty openai/anthropic seeds', async () => {
    mockFindOne.mockImplementation(async (query: { name?: string }) => {
      if (query.name === 'GPT-4o') {
        return { _id: 'legacy-1', name: query.name, apiKey: '' }
      }
      if (query.name === 'Claude 3.5 Sonnet') {
        return { _id: 'legacy-2', name: query.name, apiKey: '' }
      }
      return null
    })
    mockCreate.mockResolvedValue({})

    const { ensureModelConfigs } = await import('../utils/seedModelConfigs.js')
    await ensureModelConfigs()

    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('legacy-1')
    expect(mockFindByIdAndDelete).toHaveBeenCalledWith('legacy-2')
  })
})

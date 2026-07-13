import { encrypt } from '../services/credentialService.js'
import { ModelConfigModel } from '../models/ModelConfig.js'
import type { IModelParameters } from '../models/ModelConfig.js'
import { resolveProviderBaseUrl, resolveProviderEnvApiKey } from './modelProviderEnv.js'

interface SeedModelConfig {
  name: string
  provider: 'deepseek' | 'mimo'
  model: string
  baseUrl: string
  parameters: IModelParameters
  isDefault: boolean
}

/** 平台默认模型（仅 DeepSeek + Mimo，见 api-docs.deepseek.com / Mimo OpenAI 兼容文档） */
const seedConfigs: SeedModelConfig[] = [
  {
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    baseUrl: 'https://api.deepseek.com',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: true,
  },
  {
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: false,
  },
  {
    name: 'Mimo v2.5',
    provider: 'mimo',
    model: 'mimo-v2.5',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: false,
  },
]

const LEGACY_REMOVED_SEED_NAMES = ['GPT-4o', 'Claude 3.5 Sonnet']

function encryptApiKeyIfPossible(apiKey: string): string {
  if (!apiKey) return ''
  try {
    return encrypt({ apiKey })
  } catch {
    return apiKey
  }
}

async function removeLegacyEmptySeeds(): Promise<void> {
  for (const name of LEGACY_REMOVED_SEED_NAMES) {
    const doc = await ModelConfigModel.findOne({ name })
    if (doc && !doc.apiKey) {
      await ModelConfigModel.findByIdAndDelete(doc._id)
      console.log(`[seed] Removed legacy empty model config: ${name}`)
    }
  }
}

/**
 * Ensure platform default model configs exist in DB.
 */
export async function ensureModelConfigs(): Promise<void> {
  const platformEnabled = process.env.PLATFORM_LLM_ENABLED !== 'false'
  let created = 0
  let synced = 0

  await removeLegacyEmptySeeds()

  for (const config of seedConfigs) {
    const envApiKey = platformEnabled ? resolveProviderEnvApiKey(config.provider) : ''
    const baseUrl = resolveProviderBaseUrl(config.provider, config.baseUrl)
    const existing = await ModelConfigModel.findOne({ name: config.name })

    if (!existing) {
      await ModelConfigModel.create({
        name: config.name,
        provider: config.provider,
        model: config.model,
        apiKey: encryptApiKeyIfPossible(envApiKey),
        baseUrl,
        parameters: config.parameters,
        isDefault: config.isDefault,
      })
      created++
      console.log(`[seed] Model config created: ${config.name} (${config.provider}/${config.model})`)
      continue
    }

    const updates: Record<string, unknown> = {}
    if (!existing.apiKey && envApiKey) {
      updates.apiKey = encryptApiKeyIfPossible(envApiKey)
    }
    if (!existing.baseUrl && baseUrl) {
      updates.baseUrl = baseUrl
    }

    if (Object.keys(updates).length > 0) {
      await ModelConfigModel.findByIdAndUpdate(existing._id, updates)
      synced++
      console.log(`[seed] Model config synced from env: ${config.name}`)
    }
  }

  const total = await ModelConfigModel.countDocuments()
  if (total === 0) {
    console.log('[seed] No model configs — set DEEPSEEK_API_KEY / MIMO_API_KEY or add via 模型与连接')
    return
  }

  const hasDefault = await ModelConfigModel.exists({ isDefault: true })
  if (!hasDefault) {
    const first = await ModelConfigModel.findOne({ name: 'DeepSeek V4 Flash' })
      ?? await ModelConfigModel.findOne({ provider: 'deepseek' })
      ?? await ModelConfigModel.findOne().sort({ createdAt: 1 })
    if (first) {
      await ModelConfigModel.findByIdAndUpdate(first._id, { isDefault: true })
      console.log(`[seed] Marked default model config: ${first.name}`)
    }
  }

  if (created === 0 && synced === 0) {
    console.log('[seed] Model configs already up to date')
  }
}

/** @deprecated Use ensureModelConfigs */
export async function seedModelConfigs(): Promise<void> {
  await ensureModelConfigs()
}

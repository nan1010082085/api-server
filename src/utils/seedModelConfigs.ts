import { encrypt } from '../services/credentialService.js'
import { ProviderModel } from '../models/Provider.js'
import type { ProviderType } from '../models/Provider.js'
import { ModelModel } from '../models/Model.js'
import type { IModelParameters } from '../models/Model.js'
import { ModelConfigModel } from '../models/ModelConfig.js'
import { resolveProviderBaseUrl, resolveProviderEnvApiKey } from './modelProviderEnv.js'

// ============================================================
// New: Provider + Model normalized seed
// ============================================================

interface SeedProvider {
  name: string
  type: ProviderType
  defaultBaseUrl: string
  apiKeyEnvVars: string[]
}

interface SeedModel {
  name: string
  providerName: string
  model: string
  parameters: IModelParameters
  isDefault: boolean
}

const seedProviders: SeedProvider[] = [
  {
    name: 'DeepSeek',
    type: 'deepseek',
    defaultBaseUrl: 'https://api.deepseek.com',
    apiKeyEnvVars: ['DEEPSEEK_API_KEY'],
  },
  {
    name: 'Mimo',
    type: 'mimo',
    defaultBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    apiKeyEnvVars: ['MIMO_API_KEY'],
  },
  {
    name: 'Ollama',
    type: 'ollama',
    defaultBaseUrl: 'http://localhost:11434',
    apiKeyEnvVars: [],
  },
]

const seedModels: SeedModel[] = [
  {
    name: 'DeepSeek V4 Flash',
    providerName: 'DeepSeek',
    model: 'deepseek-v4-flash',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: true,
  },
  {
    name: 'DeepSeek V4 Pro',
    providerName: 'DeepSeek',
    model: 'deepseek-v4-pro',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: false,
  },
  {
    name: 'Mimo v2.5',
    providerName: 'Mimo',
    model: 'mimo-v2.5',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: false,
  },
  {
    name: 'Llama 3',
    providerName: 'Ollama',
    model: 'llama3',
    parameters: { temperature: 0.7, maxTokens: 4096, topP: 1 },
    isDefault: false,
  },
]

function resolveEnvApiKey(envVars: string[]): string {
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim()
    if (value) return value
  }
  return ''
}

function resolveOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434'
}

function encryptApiKeyIfPossible(apiKey: string): string {
  if (!apiKey) return ''
  try {
    return encrypt({ apiKey })
  } catch {
    return apiKey
  }
}

/**
 * Seed Provider + Model normalized tables.
 * Providers are created/upserted first, then Models are linked via providerId.
 */
export async function seedProvidersAndModels(): Promise<void> {
  const platformEnabled = process.env.PLATFORM_LLM_ENABLED !== 'false'

  // Phase 1: Seed providers
  const providerIdMap = new Map<string, string>()
  let providersCreated = 0
  let providersSynced = 0

  for (const sp of seedProviders) {
    const apiKey = platformEnabled ? resolveEnvApiKey(sp.apiKeyEnvVars) : ''
    const baseUrl = sp.type === 'ollama' ? resolveOllamaBaseUrl() : sp.defaultBaseUrl

    const existing = await ProviderModel.findOne({ name: sp.name })

    if (!existing) {
      const doc = await ProviderModel.create({
        name: sp.name,
        type: sp.type,
        baseUrl,
        apiKey: apiKey || '',
        isActive: true,
      })
      providerIdMap.set(sp.name, String(doc._id))
      providersCreated++
      console.log(`[seed] Provider created: ${sp.name} (${sp.type})`)
      continue
    }

    providerIdMap.set(sp.name, String(existing._id))

    const updates: Record<string, unknown> = {}
    if (!existing.apiKey && apiKey) {
      updates.apiKey = encryptApiKeyIfPossible(apiKey)
    }
    if (!existing.baseUrl && baseUrl) {
      updates.baseUrl = baseUrl
    }

    if (Object.keys(updates).length > 0) {
      await ProviderModel.findByIdAndUpdate(existing._id, updates)
      providersSynced++
      console.log(`[seed] Provider synced from env: ${sp.name}`)
    }
  }

  // Phase 2: Seed models
  let modelsCreated = 0
  let modelsSynced = 0

  for (const sm of seedModels) {
    const providerId = providerIdMap.get(sm.providerName)
    if (!providerId) {
      console.warn(`[seed] Skipping model ${sm.name}: provider ${sm.providerName} not resolved`)
      continue
    }

    const existing = await ModelModel.findOne({ name: sm.name })

    if (!existing) {
      await ModelModel.create({
        name: sm.name,
        providerId,
        model: sm.model,
        parameters: sm.parameters,
        isDefault: sm.isDefault,
        isActive: true,
      })
      modelsCreated++
      console.log(`[seed] Model created: ${sm.name} (${sm.model})`)
      continue
    }

    if (String(existing.providerId) !== providerId) {
      await ModelModel.findByIdAndUpdate(existing._id, { providerId })
      modelsSynced++
      console.log(`[seed] Model provider re-linked: ${sm.name}`)
    }
  }

  // Ensure at least one default model
  const hasDefault = await ModelModel.exists({ isDefault: true })
  if (!hasDefault) {
    const first = await ModelModel.findOne({ name: 'DeepSeek V4 Flash' })
      ?? await ModelModel.findOne().sort({ createdAt: 1 })
    if (first) {
      await ModelModel.findByIdAndUpdate(first._id, { isDefault: true })
      console.log(`[seed] Marked default model: ${first.name}`)
    }
  }

  if (providersCreated === 0 && providersSynced === 0 && modelsCreated === 0 && modelsSynced === 0) {
    console.log('[seed] Providers and models already up to date')
  } else {
    console.log(`[seed] Providers: ${providersCreated} created, ${providersSynced} synced`)
    console.log(`[seed] Models: ${modelsCreated} created, ${modelsSynced} synced`)
  }
}

// ============================================================
// Legacy: flat ModelConfig seed (deprecated)
// ============================================================

/** @deprecated Use seedProvidersAndModels() — Provider + Model normalized tables */
interface SeedModelConfig {
  name: string
  provider: 'deepseek' | 'mimo'
  model: string
  baseUrl: string
  parameters: IModelParameters
  isDefault: boolean
}

/** @deprecated */
const legacySeedConfigs: SeedModelConfig[] = [
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

async function removeLegacyEmptySeeds(): Promise<void> {
  for (const name of LEGACY_REMOVED_SEED_NAMES) {
    const doc = await ModelConfigModel.findOne({ name })
    if (doc && !doc.apiKey) {
      await ModelConfigModel.findByIdAndDelete(doc._id)
      console.log(`[seed] Removed legacy empty model config: ${name}`)
    }
  }
}

/** @deprecated Use seedProvidersAndModels() */
export async function ensureModelConfigs(): Promise<void> {
  const platformEnabled = process.env.PLATFORM_LLM_ENABLED !== 'false'
  let created = 0
  let synced = 0

  await removeLegacyEmptySeeds()

  for (const config of legacySeedConfigs) {
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

/** @deprecated Use seedProvidersAndModels() */
export async function seedModelConfigs(): Promise<void> {
  await ensureModelConfigs()
}

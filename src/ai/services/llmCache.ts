/**
 * LLM Instance Cache — ChatOpenAI singleton per model.
 *
 * Resolves LLM configuration with user config > DB > platform env priority:
 *
 *   1. Request user config — per-request apiKey/provider/baseURL (highest priority)
 *   2. Tenant default — ModelConfig from DB (isDefault=true, auto-scoped by tenantPlugin)
 *   3. Platform demo  — LLMManager providers from env vars (skipped when PLATFORM_LLM_ENABLED=false)
 *   4. Env fallback   — direct DEEPSEEK_API_KEY (skipped when PLATFORM_LLM_ENABLED=false)
 *
 * Cache key includes provider name and source to avoid collisions.
 *
 * Usage:
 *   import { getLLM } from '../services/llmCache.js'
 *   const model = getLLM()           // default provider from llmManager
 *   const fast = getLLM({ temperature: 0 })  // cached separately
 *   const custom = getLLM({ userConfig: { apiKey: 'user-key' } })  // user's own key
 */

import { ChatOpenAI } from '@langchain/openai'
import { llmManager } from './llmManager.js'
import type { LangChainModelOptions } from './llmProvider.js'
import { getProviderDefaultBaseUrl, resolveProviderEnvApiKey } from '../../utils/modelProviderEnv.js'

interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  /** Enable JSON response format (for structured output). */
  jsonMode?: boolean
  /** Per-request user config — highest priority, overrides all other sources. */
  userConfig?: {
    provider?: string
    apiKey: string
    baseURL?: string
    model?: string
  }
}

interface ResolvedConfig {
  providerName: string
  apiKey: string
  baseURL: string
  model: string
  temperature: number
  maxTokens: number
  /** Where the config was resolved from: 'db' = tenant ModelConfig, 'env' = LLMManager/env vars. */
  source: 'db' | 'env'
}

const llmCache = new Map<string, ChatOpenAI>()

function cacheKey(providerName: string, opts: LLMOptions, resolved: ResolvedConfig): string {
  const json = opts.jsonMode ? 'json' : 'text'
  return `${providerName}|${resolved.source}|${resolved.model}|${resolved.temperature}|${resolved.maxTokens}|${json}`
}

/**
 * Resolve the LLM configuration.
 *
 * Priority (user config > DB > platform env):
 * 1. Request user config — per-request apiKey/provider/baseURL (highest priority)
 * 2. Tenant default — ModelConfig with isDefault=true from DB (auto-scoped by tenantPlugin)
 * 3. Platform demo — LLMManager providers registered from env vars (skipped when PLATFORM_LLM_ENABLED=false)
 * 4. Environment variable fallback — direct DEEPSEEK_API_KEY (skipped when PLATFORM_LLM_ENABLED=false)
 *
 * When PLATFORM_LLM_ENABLED=false, only DB-stored ModelConfig records and user config are used.
 */
async function resolveConfig(opts: LLMOptions): Promise<ResolvedConfig> {
  const platformEnabled = process.env.PLATFORM_LLM_ENABLED !== 'false'

  // ── Tier 1: Request user config ──
  // Per-request user-provided credentials take highest priority.
  if (opts.userConfig) {
    const provider = opts.userConfig.provider || 'openai'
    return {
      providerName: provider,
      apiKey: opts.userConfig.apiKey,
      baseURL: opts.userConfig.baseURL || getProviderDefaultBaseUrl(provider),
      model: opts.userConfig.model ?? opts.model ?? 'deepseek-v4-flash',
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxTokens ?? 8192,
      source: 'db', // treat as DB-like (direct construction, not via LLMManager)
    }
  }

  // ── Tier 2: Tenant default from DB ──
  // tenantPlugin auto-scopes queries to the current tenant via AsyncLocalStorage.
  const { ModelConfigModel } = await import('../../models/ModelConfig.js')

  // If caller specified a model, try to find a matching config first
  type DbConfigLean = {
    provider: string
    apiKey: string
    baseUrl: string
    model: string
    parameters?: { temperature?: number; maxTokens?: number }
  }

  const loadDbConfig = async (filter: Record<string, unknown>): Promise<DbConfigLean | null> => {
    const doc = await ModelConfigModel.findOne(filter).lean()
    if (!doc || Array.isArray(doc)) return null
    return doc as unknown as DbConfigLean
  }

  let dbConfig: DbConfigLean | null = null

  if (opts.model) {
    dbConfig = await loadDbConfig({ model: opts.model })
  }

  // Fall back to tenant default
  if (!dbConfig) {
    dbConfig = await loadDbConfig({ isDefault: true })
  }

  if (dbConfig) {
    return {
      providerName: dbConfig.provider,
      apiKey: dbConfig.apiKey || (platformEnabled ? resolveProviderEnvApiKey(dbConfig.provider) : '') || '',
      baseURL: dbConfig.baseUrl || getProviderDefaultBaseUrl(dbConfig.provider),
      model: opts.model ?? dbConfig.model,
      temperature: opts.temperature ?? dbConfig.parameters?.temperature ?? 0.7,
      maxTokens: opts.maxTokens ?? dbConfig.parameters?.maxTokens ?? 8192,
      source: 'db',
    }
  }

  // ── Tier 3: Platform demo (LLMManager env-registered providers) ──
  if (platformEnabled) {
    try {
      const provider = llmManager.getProvider()
      return {
        providerName: provider.name,
        apiKey: '', // provider handles its own API key internally
        baseURL: '',
        model: opts.model ?? provider.defaultModel,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 8192,
        source: 'env',
      }
    } catch {
      // LLMManager has no providers — fall through
    }
  }

  // ── Tier 4: Environment variable fallback ──
  if (platformEnabled) {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (apiKey) {
      return {
        providerName: 'deepseek',
        apiKey,
        baseURL: 'https://api.deepseek.com',
        model: opts.model ?? 'deepseek-v4-flash',
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 8192,
        source: 'env',
      }
    }
  }

  // ── Nothing found — guide the user ──
  throw new Error(
    platformEnabled
      ? 'No LLM provider configured. '
        + 'Create a ModelConfig in Settings > Model, or set DEEPSEEK_API_KEY environment variable.'
      : 'PLATFORM_LLM_ENABLED is false and no ModelConfig found in database. '
        + 'Create a ModelConfig in Settings > Model to enable LLM features.',
  )
}

function getDefaultBaseUrl(provider: string): string {
  return getProviderDefaultBaseUrl(provider)
}

/**
 * Get or create a cached ChatOpenAI instance.
 *
 * When LLMManager has a registered provider, uses provider.createLangChainModel()
 * for a proper LangChain-compatible instance. Otherwise falls back to direct
 * ChatOpenAI construction from DB/env config.
 *
 * Cache key includes provider name to avoid collisions when switching providers.
 */
export async function getLLM(opts: LLMOptions = {}): Promise<ChatOpenAI> {
  const resolved = await resolveConfig(opts)
  const key = cacheKey(resolved.providerName, opts, resolved)

  if (!llmCache.has(key)) {
    // DB config uses its own credentials — always construct directly.
    // Only use LLMManager's createLangChainModel when config came from env.
    if (resolved.source === 'env') {
      try {
        const provider = llmManager.getProvider(resolved.providerName)
        const langChainOpts: LangChainModelOptions = {
          model: resolved.model,
          temperature: resolved.temperature,
          maxTokens: resolved.maxTokens,
          streaming: true,
        }
        // temperature=0 时不启用 jsonMode（兼容性：低温 + json_object 可能不稳定）
        if (opts.jsonMode && resolved.temperature > 0) {
          langChainOpts.responseFormat = { type: 'json_object' }
        }
        const model = provider.createLangChainModel(langChainOpts) as ChatOpenAI
        llmCache.set(key, model)
        return llmCache.get(key)!
      } catch {
        // Provider not found in LLMManager — fall through to direct construction
      }
    }

    // Direct ChatOpenAI construction (DB config or env fallback)
    if (!resolved.apiKey) {
      throw new Error('API key is required. Set a default ModelConfig or DEEPSEEK_API_KEY environment variable.')
    }

    const effectiveJsonMode = opts.jsonMode && resolved.temperature > 0

    const model = new ChatOpenAI({
      model: resolved.model,
      apiKey: resolved.apiKey,
      configuration: { baseURL: resolved.baseURL },
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      streaming: true,
      timeout: 120_000,
      ...(effectiveJsonMode ? { modelKwargs: { response_format: { type: 'json_object' } } } : {}),
    })

    llmCache.set(key, model)
  }

  return llmCache.get(key)!
}

/**
 * Clear the LLM cache. Useful for testing or config changes.
 */
export function clearLLMCache(): void {
  llmCache.clear()
}

/**
 * Get the current LLM provider info from LLMManager.
 * Falls back to null if no providers are registered.
 */
export function getCurrentProvider(): { name: string; defaultModel: string } | null {
  try {
    const provider = llmManager.getProvider()
    return { name: provider.name, defaultModel: provider.defaultModel }
  } catch {
    return null
  }
}

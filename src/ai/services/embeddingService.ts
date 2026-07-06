/**
 * Embedding Service — generates text embeddings via OpenAI-compatible API.
 *
 * DeepSeek chat API key does NOT support embeddings (POST /v1/embeddings returns 404).
 * Configure a dedicated embedding provider via EMBEDDING_* or OPENAI_API_KEY.
 */

import OpenAI from 'openai'

const MAX_CACHE_SIZE = 500

interface EmbeddingClientConfig {
  apiKey: string
  baseURL: string
  model: string
}

let client: OpenAI | null = null
let clientConfig: EmbeddingClientConfig | null = null

function resolveEmbeddingConfig(): EmbeddingClientConfig {
  if (process.env.EMBEDDING_API_KEY) {
    return {
      apiKey: process.env.EMBEDDING_API_KEY,
      baseURL: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    }
  }

  throw new Error(
    'Embedding API 未配置：DeepSeek 仅提供对话模型，不提供 Embedding 接口。'
    + '请设置 EMBEDDING_API_KEY + EMBEDDING_BASE_URL（或 OPENAI_API_KEY）以启用向量检索。',
  )
}

function getClient(): OpenAI {
  const config = resolveEmbeddingConfig()
  if (!client || !clientConfig
    || clientConfig.apiKey !== config.apiKey
    || clientConfig.baseURL !== config.baseURL
    || clientConfig.model !== config.model) {
    client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
    })
    clientConfig = config
  }
  return client
}

function getEmbeddingModel(): string {
  return resolveEmbeddingConfig().model
}

function getDefaultDimensions(): number {
  const configured = Number(process.env.EMBEDDING_DIMENSIONS)
  return Number.isFinite(configured) && configured > 0 ? configured : 1536
}

// ────────────────────────────────────────────
// LRU Cache
// ────────────────────────────────────────────

const cache = new Map<string, number[]>()

function cacheGet(key: string): number[] | undefined {
  const value = cache.get(key)
  if (value !== undefined) {
    cache.delete(key)
    cache.set(key, value)
  }
  return value
}

function cacheSet(key: string, value: number[]): void {
  if (cache.has(key)) {
    cache.delete(key)
  } else if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
  cache.set(key, value)
}

// ────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────

export interface EmbeddingResult {
  vector: number[]
  dimensions: number
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY)
}

/**
 * Generate embedding for a single text string.
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const trimmed = text.trim()
  const defaultDimensions = getDefaultDimensions()
  if (trimmed.length === 0) {
    return { vector: new Array(defaultDimensions).fill(0), dimensions: defaultDimensions }
  }

  const cached = cacheGet(trimmed)
  if (cached) {
    return { vector: cached, dimensions: cached.length }
  }

  const openai = getClient()
  const response = await openai.embeddings.create({
    model: getEmbeddingModel(),
    input: trimmed,
  })

  const vector = response.data[0].embedding
  cacheSet(trimmed, vector)

  return { vector, dimensions: vector.length }
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 */
export async function embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return []

  const defaultDimensions = getDefaultDimensions()
  const results: (EmbeddingResult | null)[] = texts.map((t) => {
    const cached = cacheGet(t.trim())
    return cached ? { vector: cached, dimensions: cached.length } : null
  })

  const uncachedIndices: number[] = []
  const uncachedTexts: string[] = []
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null && texts[i].trim().length > 0) {
      uncachedIndices.push(i)
      uncachedTexts.push(texts[i].trim())
    }
  }

  if (uncachedTexts.length > 0) {
    const openai = getClient()
    const response = await openai.embeddings.create({
      model: getEmbeddingModel(),
      input: uncachedTexts,
    })

    for (let i = 0; i < uncachedIndices.length; i++) {
      const vector = response.data[i].embedding
      cacheSet(uncachedTexts[i], vector)
      results[uncachedIndices[i]] = { vector, dimensions: vector.length }
    }
  }

  return results.map((r) => {
    if (r) return r
    return { vector: new Array(defaultDimensions).fill(0), dimensions: defaultDimensions }
  })
}

export const EMBEDDING_DIMENSIONS = getDefaultDimensions()

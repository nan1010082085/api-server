/**
 * Provider API routes.
 *
 * GET    /api/providers                    — List all providers
 * POST   /api/providers                    — Create provider
 * GET    /api/providers/embedding-config   — Read embedding model config
 * PUT    /api/providers/embedding-config   — Update embedding model config
 * PUT    /api/providers/:id                — Update provider
 * DELETE /api/providers/:id                — Delete provider (cascade delete associated models)
 * POST   /api/providers/:id/test           — Test provider connection
 */

import Router from '@koa/router'
import mongoose from 'mongoose'
import { authMiddleware } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'
import { validate } from '../middleware/validate.js'
import { ProviderModel } from '../models/Provider.js'
import { ModelModel } from '../models/Model.js'
import { ConfigModel } from '../models/Config.js'
import { maskApiKey } from '../routes/modelConfig.js'
import { encrypt, decrypt } from '../services/credentialService.js'
import {
  createProviderSchema,
  updateProviderSchema,
  testProviderSchema,
  updateEmbeddingConfigSchema,
} from './schemas/providerModelSchemas.js'
import { getProviderDefaultBaseUrl, resolveProviderEnvApiKey } from '../utils/modelProviderEnv.js'

const EMBEDDING_CONFIG_KEY = 'embedding_config'

const router = new Router({ prefix: '/api/providers' })
const requireAuth = authMiddleware({ required: true })

function maskProviderApiKey(provider: Record<string, unknown>): Record<string, unknown> {
  const plain = { ...provider }
  if (plain.apiKey) {
    plain.apiKey = maskApiKey(plain.apiKey as string)
  }
  return plain
}

// ────────────────────────────────────────────
// GET /api/providers
// List all providers
// ────────────────────────────────────────────
router.get('/', requireAuth, async (ctx) => {
  const providers = await ProviderModel.find().sort({ createdAt: -1 }).lean() as Record<string, unknown>[]

  ctx.body = {
    success: true,
    data: providers.map((p) => {
      const masked = maskProviderApiKey(p)
      masked.id = String(p._id)
      delete masked._id
      delete masked.__v
      return masked
    }),
  }
})

// ────────────────────────────────────────────
// POST /api/providers
// Create a new provider
// ────────────────────────────────────────────
router.post('/', requireAuth, requirePermission('model_config:create'), validate(createProviderSchema), async (ctx) => {
  const { name, type, baseUrl, apiKey, isActive } = ctx.request.body as {
    name: string
    type: string
    baseUrl: string
    apiKey?: string
    isActive?: boolean
  }

  const provider = await ProviderModel.create({
    name: name.trim(),
    type,
    baseUrl: baseUrl.trim(),
    apiKey: apiKey ?? '',
    isActive: isActive ?? true,
  })

  const plain = provider.toJSON() as Record<string, unknown>
  plain.apiKey = maskApiKey(plain.apiKey as string)

  ctx.status = 201
  ctx.body = { success: true, data: plain }
})

// ────────────────────────────────────────────
// Embedding Config helpers
// ────────────────────────────────────────────

interface EmbeddingConfigData {
  provider: 'siliconflow' | 'openai' | 'custom'
  model: string
  baseUrl: string
  apiKey: string
  dimensions: number
}

function getEnvEmbeddingDefaults(): EmbeddingConfigData {
  if (process.env.EMBEDDING_API_KEY) {
    return {
      provider: 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      baseUrl: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.EMBEDDING_API_KEY,
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      baseUrl: process.env.OPENAI_BASE_URL || process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      dimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
    }
  }

  // Default: SiliconFlow BGE-M3
  return {
    provider: 'siliconflow',
    model: 'BAAI/bge-m3',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    dimensions: 1024,
  }
}

async function loadEmbeddingConfig(): Promise<EmbeddingConfigData> {
  const defaults = getEnvEmbeddingDefaults()

  const doc = await ConfigModel.findOne({ key: EMBEDDING_CONFIG_KEY }).lean() as Record<string, unknown> | null
  if (!doc?.value) return defaults

  try {
    const stored = JSON.parse(doc.value as string) as Record<string, unknown>
    let apiKey = (stored.apiKey as string) ?? defaults.apiKey
    // Decrypt if it looks encrypted (base64, > 50 chars)
    if (apiKey && apiKey.length > 50 && !apiKey.startsWith('sk-') && !apiKey.startsWith('tp-')) {
      try {
        apiKey = decrypt(apiKey).apiKey ?? ''
      } catch {
        // Not encrypted, leave as-is
      }
    }

    return {
      provider: (stored.provider as EmbeddingConfigData['provider']) ?? defaults.provider,
      model: (stored.model as string) ?? defaults.model,
      baseUrl: (stored.baseUrl as string) ?? defaults.baseUrl,
      apiKey,
      dimensions: (stored.dimensions as number) ?? defaults.dimensions,
    }
  } catch {
    return defaults
  }
}

async function saveEmbeddingConfig(config: EmbeddingConfigData): Promise<void> {
  const value: Record<string, unknown> = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    dimensions: config.dimensions,
  }
  // Encrypt API key if present
  if (config.apiKey) {
    value.apiKey = encrypt({ apiKey: config.apiKey })
  } else {
    value.apiKey = ''
  }

  await ConfigModel.findOneAndUpdate(
    { key: EMBEDDING_CONFIG_KEY },
    {
      $set: {
        value: JSON.stringify(value),
        name: '嵌入模型配置',
        type: 'system',
        status: 'active',
      },
      $setOnInsert: { key: EMBEDDING_CONFIG_KEY },
    },
    { upsert: true },
  )
}

// ────────────────────────────────────────────
// GET /api/providers/embedding-config
// Read embedding model configuration
// ────────────────────────────────────────────
router.get('/embedding-config', requireAuth, async (ctx) => {
  const config = await loadEmbeddingConfig()

  ctx.body = {
    success: true,
    data: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? maskApiKey(config.apiKey) : '',
      dimensions: config.dimensions,
    },
  }
})

// ────────────────────────────────────────────
// PUT /api/providers/embedding-config
// Update embedding model configuration
// ────────────────────────────────────────────
router.put('/embedding-config', requireAuth, requirePermission('model_config:edit'), validate(updateEmbeddingConfigSchema), async (ctx) => {
  const body = ctx.request.body as Record<string, unknown>
  const current = await loadEmbeddingConfig()

  const updated: EmbeddingConfigData = {
    provider: (body.provider as EmbeddingConfigData['provider']) ?? current.provider,
    model: (body.model as string) ?? current.model,
    baseUrl: (body.baseUrl as string) ?? current.baseUrl,
    apiKey: body.apiKey !== undefined ? (body.apiKey as string) : current.apiKey,
    dimensions: (body.dimensions as number) ?? current.dimensions,
  }

  await saveEmbeddingConfig(updated)

  ctx.body = {
    success: true,
    data: {
      provider: updated.provider,
      model: updated.model,
      baseUrl: updated.baseUrl,
      apiKey: updated.apiKey ? maskApiKey(updated.apiKey) : '',
      dimensions: updated.dimensions,
    },
  }
})

// ────────────────────────────────────────────
// PUT /api/providers/:id
// Update provider
// ────────────────────────────────────────────
router.put('/:id', requireAuth, requirePermission('model_config:edit'), validate(updateProviderSchema), async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as Record<string, unknown>

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const existing = await ProviderModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Provider not found.' } }
    return
  }

  // Use save() instead of findByIdAndUpdate() to trigger the pre('save') encryption hook
  if (body.name !== undefined) existing.name = (body.name as string).trim()
  if (body.type !== undefined) existing.type = body.type as typeof existing.type
  if (body.baseUrl !== undefined) existing.baseUrl = (body.baseUrl as string).trim()
  if (body.apiKey !== undefined) existing.apiKey = body.apiKey as string
  if (body.isActive !== undefined) existing.isActive = body.isActive as boolean

  const provider = await existing.save()

  const plain = provider.toJSON() as Record<string, unknown>
  plain.apiKey = maskApiKey(plain.apiKey as string)

  ctx.body = { success: true, data: plain }
})

// ────────────────────────────────────────────
// DELETE /api/providers/:id
// Delete provider and cascade delete associated models
// ────────────────────────────────────────────
router.delete('/:id', requireAuth, requirePermission('model_config:delete'), async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const existing = await ProviderModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Provider not found.' } }
    return
  }

  // Cascade delete associated models
  const deletedModels = await ModelModel.deleteMany({ providerId: id })

  await ProviderModel.findByIdAndDelete(id)

  ctx.body = {
    success: true,
    data: {
      deletedModels: deletedModels.deletedCount ?? 0,
    },
  }
})

// ────────────────────────────────────────────
// POST /api/providers/:id/test
// Test provider connection
// ────────────────────────────────────────────
router.post('/:id/test', requireAuth, validate(testProviderSchema), async (ctx) => {
  const { id } = ctx.params
  const { message } = ctx.request.body as { message?: string }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const provider = await ProviderModel.findById(id)
  if (!provider) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Provider not found.' } }
    return
  }

  // Resolve API key: prefer stored key, fallback to env
  const apiKey = provider.apiKey || resolveProviderEnvApiKey(provider.type)
  if (!apiKey && provider.type !== 'ollama') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'API key is required for this provider.' } }
    return
  }

  try {
    const baseUrl = provider.baseUrl || getProviderDefaultBaseUrl(provider.type)
    const testMessage = message ?? 'Hello, respond with OK'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.type === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: testMessage }],
        max_tokens: 50,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.status = 502
      ctx.body = {
        success: false,
        error: {
          message: `Provider returned HTTP ${response.status}`,
          details: errorBody.slice(0, 500),
        },
      }
      return
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number }
    }

    const reply = data.choices?.[0]?.message?.content ?? ''
    const tokens = data.usage?.total_tokens ?? 0

    ctx.body = {
      success: true,
      data: {
        reply: reply.slice(0, 200),
        tokens,
        provider: provider.type,
        baseUrl: provider.baseUrl,
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    ctx.status = 502
    ctx.body = {
      success: false,
      error: {
        message: 'Connection test failed',
        details: errorMsg,
      },
    }
  }
})

export default router

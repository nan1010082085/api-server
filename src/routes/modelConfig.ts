import Router from '@koa/router'
import { ModelConfigModel } from '../models/ModelConfig.js'
import { authMiddleware } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'
import { validate } from '../middleware/validate.js'
import { createModelConfigSchema, updateModelConfigSchema, testModelConfigSchema } from '../schemas/modelConfigSchemas.js'
import { clearLLMCache } from '../ai/services/llmCache.js'
import { getProviderDefaultBaseUrl, resolveProviderEnvApiKey } from '../utils/modelProviderEnv.js'
import { resolveStoredProviderApiKey } from '../models/Provider.js'
import mongoose from 'mongoose'

const requireAuth = authMiddleware({ required: true })

const router = new Router({ prefix: '/api/model-configs' })

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Mask an API key for safe display.
 * Keeps the first 4 and last 4 characters; replaces the middle with asterisks.
 * Keys shorter than 9 characters are fully masked.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length === 0) return ''
  if (key.length < 9) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

/**
 * Mask the apiKey field in a ModelConfig object (plain or Mongoose doc).
 * Returns a plain object so Mongoose transforms are already applied.
 */
function maskConfigApiKey<T extends Record<string, unknown>>(config: T): T {
  const maybe = config as unknown as { toJSON?: () => Record<string, unknown> }
  const plain = maybe.toJSON ? maybe.toJSON() : { ...config }
  if (plain.apiKey) {
    plain.apiKey = maskApiKey(plain.apiKey as string)
  }
  return plain as T
}

// ────────────────────────────────────────────
// GET /api/model-configs
// List model configurations
// ────────────────────────────────────────────
router.get('/', requireAuth, async (ctx) => {
  const { search, provider, page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const skip = (page - 1) * pageSize

  const filter: Record<string, unknown> = {}
  if (search) filter.name = { $regex: escapeRegex(search as string), $options: 'i' }
  if (provider && ['deepseek', 'openai', 'anthropic', 'ollama', 'mimo'].includes(provider as string)) {
    filter.provider = provider
  }

  const [items, total] = await Promise.all([
    ModelConfigModel.find(filter).skip(skip).limit(pageSize).sort({ updatedAt: -1 }),
    ModelConfigModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: items.map(maskConfigApiKey),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// POST /api/model-configs
// Create a new model configuration
// ────────────────────────────────────────────
router.post('/', requireAuth, requirePermission('model_config:create'), validate(createModelConfigSchema), async (ctx) => {
  const { name, provider, model, apiKey, baseUrl, parameters, isDefault } = ctx.request.body as {
    name: string
    provider: string
    model: string
    apiKey?: string
    baseUrl?: string
    parameters?: Record<string, number>
    isDefault?: boolean
  }

  // If isDefault, unset other defaults for the same provider
  if (isDefault) {
    await ModelConfigModel.updateMany(
      { provider, isDefault: true },
      { $set: { isDefault: false } },
    )
  }

  const config = await ModelConfigModel.create({
    name: name.trim(),
    provider,
    model: model.trim(),
    apiKey: apiKey ?? '',
    baseUrl: baseUrl ?? '',
    parameters: parameters ?? {},
    isDefault: isDefault ?? false,
  })

  clearLLMCache()

  ctx.status = 201
  ctx.body = { success: true, data: config }
})

// ────────────────────────────────────────────
// GET /api/model-configs/:id
// Get model configuration detail
// ────────────────────────────────────────────
router.get('/:id', requireAuth, async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const config = await ModelConfigModel.findById(id)

  if (!config) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model config not found.' } }
    return
  }

  ctx.body = { success: true, data: maskConfigApiKey(config) }
})

// ────────────────────────────────────────────
// PUT /api/model-configs/:id
// Update model configuration
// ────────────────────────────────────────────
router.put('/:id', requireAuth, requirePermission('model_config:edit'), validate(updateModelConfigSchema), async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as Record<string, unknown>

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const existing = await ModelConfigModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model config not found.' } }
    return
  }

  // If setting isDefault, unset other defaults for the same provider
  const targetProvider = (body.provider as string) ?? existing.provider
  if (body.isDefault === true) {
    await ModelConfigModel.updateMany(
      { provider: targetProvider, isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } },
    )
  }

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = (body.name as string).trim()
  if (body.provider !== undefined) update.provider = body.provider
  if (body.model !== undefined) update.model = (body.model as string).trim()
  if (body.apiKey !== undefined) update.apiKey = body.apiKey
  if (body.baseUrl !== undefined) update.baseUrl = body.baseUrl
  if (body.parameters !== undefined) update.parameters = body.parameters
  if (body.isDefault !== undefined) update.isDefault = body.isDefault

  const config = await ModelConfigModel.findByIdAndUpdate(id, update, { new: true })

  clearLLMCache()

  ctx.body = { success: true, data: config }
})

// ────────────────────────────────────────────
// DELETE /api/model-configs/:id
// Delete model configuration
// ────────────────────────────────────────────
router.delete('/:id', requireAuth, requirePermission('model_config:delete'), async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const existing = await ModelConfigModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model config not found.' } }
    return
  }

  await ModelConfigModel.findByIdAndDelete(id)

  clearLLMCache()

  ctx.status = 200
  ctx.body = { success: true, data: null }
})

// ────────────────────────────────────────────
// POST /api/model-configs/:id/test
// Test model connectivity
// ────────────────────────────────────────────
router.post('/:id/test', requireAuth, validate(testModelConfigSchema), async (ctx) => {
  const { id } = ctx.params
  const { message } = ctx.request.body as { message?: string }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const config = await ModelConfigModel.findById(id)
  if (!config) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model config not found.' } }
    return
  }

  if (!resolveStoredProviderApiKey(config.apiKey) && config.provider !== 'ollama') {
    const envApiKey = resolveProviderEnvApiKey(config.provider)
    if (!envApiKey) {
      ctx.status = 400
      ctx.body = { success: false, error: { message: 'API key is required for this provider.' } }
      return
    }
  }

  const apiKey = resolveStoredProviderApiKey(config.apiKey) || resolveProviderEnvApiKey(config.provider)

  try {
    const baseUrl = (config.baseUrl || getProviderDefaultBaseUrl(config.provider)).replace(/\/+$/, '')
    const testMessage = message ?? 'Hello, respond with OK'

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
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
        model: config.model,
        provider: config.provider,
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

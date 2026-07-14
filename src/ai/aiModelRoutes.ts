/**
 * AI Model API routes.
 *
 * GET    /api/models          — List all models (optional ?providerId= filter)
 * POST   /api/models          — Create model
 * PUT    /api/models/:id      — Update model
 * DELETE /api/models/:id      — Delete model
 * POST   /api/models/:id/test — Test model invocation
 */

import Router from '@koa/router'
import mongoose from 'mongoose'
import { authMiddleware } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'
import { validate } from '../middleware/validate.js'
import { ModelModel } from '../models/Model.js'
import { ProviderModel } from '../models/Provider.js'
import {
  createModelSchema,
  updateModelSchema,
  testModelSchema,
} from './schemas/providerModelSchemas.js'

const router = new Router({ prefix: '/api/models' })
const requireAuth = authMiddleware({ required: true })

// ────────────────────────────────────────────
// GET /api/models
// List all models (optional ?providerId= filter)
// ────────────────────────────────────────────
router.get('/', requireAuth, async (ctx) => {
  const { providerId } = ctx.query as { providerId?: string }

  const filter: Record<string, unknown> = {}
  if (providerId) {
    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      ctx.status = 400
      ctx.body = { success: false, error: { message: 'Invalid providerId format.' } }
      return
    }
    filter.providerId = providerId
  }

  const models = await ModelModel.find(filter)
    .sort({ createdAt: -1 })
    .populate('providerId', 'name type baseUrl isActive')
    .lean() as unknown as Array<Record<string, unknown>>

  ctx.body = {
    success: true,
    data: models.map((m) => {
      const plain = { ...m }
      plain.id = String(m._id)
      delete plain._id
      delete plain.__v
      return plain
    }),
  }
})

// ────────────────────────────────────────────
// POST /api/models
// Create a new model
// ────────────────────────────────────────────
router.post('/', requireAuth, requirePermission('model_config:create'), validate(createModelSchema), async (ctx) => {
  const { name, providerId, model, parameters, isDefault, isActive } = ctx.request.body as {
    name: string
    providerId: string
    model: string
    parameters?: Record<string, number>
    isDefault?: boolean
    isActive?: boolean
  }

  if (!mongoose.Types.ObjectId.isValid(providerId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid providerId format.' } }
    return
  }

  // Verify provider exists
  const provider = await ProviderModel.findById(providerId)
  if (!provider) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Provider not found.' } }
    return
  }

  // If isDefault, unset other defaults
  if (isDefault) {
    await ModelModel.updateMany(
      { isDefault: true },
      { $set: { isDefault: false } },
    )
  }

  const doc = await ModelModel.create({
    name: name.trim(),
    providerId,
    model: model.trim(),
    parameters: parameters ?? {},
    isDefault: isDefault ?? false,
    isActive: isActive ?? true,
  })

  const populated = await ModelModel.findById(doc._id)
    .populate('providerId', 'name type baseUrl isActive')
    .lean() as Record<string, unknown> | null

  if (populated) {
    populated.id = String(populated._id)
    delete populated._id
    delete populated.__v
  }

  ctx.status = 201
  ctx.body = { success: true, data: populated }
})

// ────────────────────────────────────────────
// PUT /api/models/:id
// Update model
// ────────────────────────────────────────────
router.put('/:id', requireAuth, requirePermission('model_config:edit'), validate(updateModelSchema), async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as Record<string, unknown>

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const existing = await ModelModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model not found.' } }
    return
  }

  // If changing providerId, verify it exists
  if (body.providerId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(body.providerId as string)) {
      ctx.status = 400
      ctx.body = { success: false, error: { message: 'Invalid providerId format.' } }
      return
    }
    const provider = await ProviderModel.findById(body.providerId)
    if (!provider) {
      ctx.status = 404
      ctx.body = { success: false, error: { message: 'Provider not found.' } }
      return
    }
  }

  // If setting isDefault, unset other defaults
  if (body.isDefault === true) {
    await ModelModel.updateMany(
      { isDefault: true, _id: { $ne: id } },
      { $set: { isDefault: false } },
    )
  }

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = (body.name as string).trim()
  if (body.providerId !== undefined) update.providerId = body.providerId
  if (body.model !== undefined) update.model = (body.model as string).trim()
  if (body.parameters !== undefined) update.parameters = body.parameters
  if (body.isDefault !== undefined) update.isDefault = body.isDefault
  if (body.isActive !== undefined) update.isActive = body.isActive

  const model = await ModelModel.findByIdAndUpdate(id, update, { new: true })
    .populate('providerId', 'name type baseUrl isActive')

  if (!model) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model not found.' } }
    return
  }

  ctx.body = { success: true, data: model }
})

// ────────────────────────────────────────────
// DELETE /api/models/:id
// Delete model
// ────────────────────────────────────────────
router.delete('/:id', requireAuth, requirePermission('model_config:delete'), async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const existing = await ModelModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model not found.' } }
    return
  }

  await ModelModel.findByIdAndDelete(id)

  ctx.body = { success: true, data: null }
})

// ────────────────────────────────────────────
// POST /api/models/:id/test
// Test model invocation
// ────────────────────────────────────────────
router.post('/:id/test', requireAuth, validate(testModelSchema), async (ctx) => {
  const { id } = ctx.params
  const { message } = ctx.request.body as { message?: string }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid ID format.' } }
    return
  }

  const model = await ModelModel.findById(id).populate('providerId')
  if (!model) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Model not found.' } }
    return
  }

  const provider = model.providerId as unknown as {
    _id: mongoose.Types.ObjectId
    type: string
    baseUrl: string
    apiKey: string
  }

  if (!provider) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Associated provider not found.' } }
    return
  }

  // Resolve API key: prefer provider's stored key, fallback to env
  const { resolveProviderEnvApiKey, getProviderDefaultBaseUrl } = await import('../utils/modelProviderEnv.js')
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
        model: model.model,
        messages: [{ role: 'user', content: testMessage }],
        max_tokens: 50,
        temperature: model.parameters?.temperature ?? 0,
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
        model: model.model,
        provider: provider.type,
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    ctx.status = 502
    ctx.body = {
      success: false,
      error: {
        message: 'Model test failed',
        details: errorMsg,
      },
    }
  }
})

export default router

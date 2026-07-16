/**
 * Quota Management API Routes
 *
 * Provides CRUD operations for per-key and per-tenant quotas.
 */

import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { QuotaModel, setQuota, removeQuota } from '../models/Quota.js'
import { logger } from '../utils/logger.js'

const router = new Router({ prefix: '/api/quotas' })

// All quota routes require authentication
router.use(authMiddleware)

/**
 * GET /api/quotas
 * List quotas for the current tenant.
 */
router.get('/', async (ctx) => {
  const { keyType } = ctx.query
  const filter: Record<string, unknown> = { isActive: true }

  if (keyType) {
    filter.keyType = keyType
  }

  const quotas = await QuotaModel.find(filter)
    .sort({ createdAt: -1 })
    .lean()

  ctx.body = quotas.map((q) => ({
    id: String(q._id),
    key: q.key,
    keyType: q.keyType,
    maxRequests: q.maxRequests,
    windowSeconds: q.windowSeconds,
    currentUsage: q.currentUsage,
    windowResetAt: q.windowResetAt,
    isActive: q.isActive,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }))
})

/**
 * GET /api/quotas/:id
 * Get a specific quota.
 */
router.get('/:id', async (ctx) => {
  const quota = await QuotaModel.findById(ctx.params.id).lean()

  if (!quota) {
    ctx.status = 404
    ctx.body = { error: 'Quota not found' }
    return
  }

  ctx.body = {
    id: String(quota._id),
    key: quota.key,
    keyType: quota.keyType,
    maxRequests: quota.maxRequests,
    windowSeconds: quota.windowSeconds,
    currentUsage: quota.currentUsage,
    windowResetAt: quota.windowResetAt,
    isActive: quota.isActive,
    createdAt: quota.createdAt,
    updatedAt: quota.updatedAt,
  }
})

/**
 * POST /api/quotas
 * Create or update a quota.
 */
router.post('/', async (ctx) => {
  const { key, keyType, maxRequests, windowSeconds } = ctx.request.body as {
    key?: string
    keyType?: string
    maxRequests?: number
    windowSeconds?: number
  }

  if (!key || !keyType || !maxRequests || !windowSeconds) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing required fields: key, keyType, maxRequests, windowSeconds',
    }
    return
  }

  if (!['apikey', 'tenant', 'user'].includes(keyType)) {
    ctx.status = 400
    ctx.body = { error: 'keyType must be one of: apikey, tenant, user' }
    return
  }

  if (maxRequests < 1 || windowSeconds < 1) {
    ctx.status = 400
    ctx.body = { error: 'maxRequests and windowSeconds must be >= 1' }
    return
  }

  try {
    const quota = await setQuota(key, keyType as 'apikey' | 'tenant' | 'user', maxRequests, windowSeconds)

    ctx.status = 201
    ctx.body = {
      id: String(quota._id),
      key: quota.key,
      keyType: quota.keyType,
      maxRequests: quota.maxRequests,
      windowSeconds: quota.windowSeconds,
      currentUsage: quota.currentUsage,
      windowResetAt: quota.windowResetAt,
      isActive: quota.isActive,
    }
  } catch (err) {
    logger.error('Failed to create/update quota:', err)
    ctx.status = 500
    ctx.body = { error: 'Failed to create/update quota' }
  }
})

/**
 * PUT /api/quotas/:id
 * Update a quota by ID.
 */
router.put('/:id', async (ctx) => {
  const { maxRequests, windowSeconds, isActive } = ctx.request.body as {
    maxRequests?: number
    windowSeconds?: number
    isActive?: boolean
  }

  const update: Record<string, unknown> = {}
  if (maxRequests !== undefined) update.maxRequests = maxRequests
  if (windowSeconds !== undefined) update.windowSeconds = windowSeconds
  if (isActive !== undefined) update.isActive = isActive

  if (Object.keys(update).length === 0) {
    ctx.status = 400
    ctx.body = { error: 'No fields to update' }
    return
  }

  const quota = await QuotaModel.findByIdAndUpdate(
    ctx.params.id,
    update,
    { new: true },
  ).lean()

  if (!quota) {
    ctx.status = 404
    ctx.body = { error: 'Quota not found' }
    return
  }

  ctx.body = {
    id: String(quota._id),
    key: quota.key,
    keyType: quota.keyType,
    maxRequests: quota.maxRequests,
    windowSeconds: quota.windowSeconds,
    currentUsage: quota.currentUsage,
    windowResetAt: quota.windowResetAt,
    isActive: quota.isActive,
  }
})

/**
 * DELETE /api/quotas/:id
 * Delete a quota by ID.
 */
router.delete('/:id', async (ctx) => {
  const quota = await QuotaModel.findByIdAndDelete(ctx.params.id).lean()

  if (!quota) {
    ctx.status = 404
    ctx.body = { error: 'Quota not found' }
    return
  }

  ctx.body = { success: true }
})

/**
 * POST /api/quotas/check
 * Check if a request would be allowed under a quota.
 */
router.post('/check', async (ctx) => {
  const { key, keyType } = ctx.request.body as {
    key?: string
    keyType?: string
  }

  if (!key || !keyType) {
    ctx.status = 400
    ctx.body = { error: 'Missing required fields: key, keyType' }
    return
  }

  const quota = await QuotaModel.findOne({ key, keyType, isActive: true }).lean()

  if (!quota) {
    ctx.body = { allowed: true, remaining: Infinity, resetAt: null }
    return
  }

  const now = new Date()
  let currentUsage = quota.currentUsage
  let windowResetAt = quota.windowResetAt

  if (windowResetAt <= now) {
    currentUsage = 0
    windowResetAt = new Date(now.getTime() + quota.windowSeconds * 1000)
  }

  const remaining = Math.max(0, quota.maxRequests - currentUsage)

  ctx.body = {
    allowed: currentUsage < quota.maxRequests,
    remaining,
    resetAt: windowResetAt,
    maxRequests: quota.maxRequests,
    windowSeconds: quota.windowSeconds,
  }
})

export default router

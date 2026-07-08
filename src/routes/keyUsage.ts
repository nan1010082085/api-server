import Router from '@koa/router'
import { KeyUsageLogModel } from '../models/KeyUsageLog.js'
import { authMiddleware } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/key-usage' })

// GET /api/key-usage — List key usage logs with filters
router.get('/', requireAuth, requirePermission('apikey:view'), async (ctx) => {
  const {
    keyId,
    workflowId,
    startDate,
    endDate,
    page: pageStr = '1',
    pageSize: pageSizeStr = '20',
  } = ctx.query

  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const skip = (page - 1) * pageSize

  const filter: Record<string, unknown> = {}

  if (keyId) filter.keyId = keyId
  if (workflowId) filter.workflowId = workflowId

  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {}
    if (startDate) createdAt.$gte = new Date(startDate as string)
    if (endDate) createdAt.$lte = new Date(endDate as string)
    filter.createdAt = createdAt
  }

  const [items, total] = await Promise.all([
    KeyUsageLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    KeyUsageLogModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: items.map((item) => item.toJSON()),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// GET /api/key-usage/stats/by-key — Usage statistics grouped by key
router.get('/stats/by-key', requireAuth, requirePermission('apikey:view'), async (ctx) => {
  const { startDate, endDate } = ctx.query

  const matchStage: Record<string, unknown> = {}
  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {}
    if (startDate) createdAt.$gte = new Date(startDate as string)
    if (endDate) createdAt.$lte = new Date(endDate as string)
    matchStage.createdAt = createdAt
  }

  const stats = await KeyUsageLogModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$keyId',
        keyName: { $first: '$keyName' },
        totalRequests: { $sum: 1 },
        successRequests: {
          $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] },
        },
        failedRequests: {
          $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
        },
        avgDuration: { $avg: '$duration' },
        lastUsedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { totalRequests: -1 } },
  ])

  ctx.body = {
    success: true,
    data: stats.map((stat) => ({
      keyId: stat._id,
      keyName: stat.keyName,
      totalRequests: stat.totalRequests,
      successRequests: stat.successRequests,
      failedRequests: stat.failedRequests,
      avgDuration: Math.round(stat.avgDuration),
      lastUsedAt: stat.lastUsedAt,
    })),
  }
})

// GET /api/key-usage/stats/by-workflow — Usage statistics grouped by workflow
router.get('/stats/by-workflow', requireAuth, requirePermission('apikey:view'), async (ctx) => {
  const { startDate, endDate, keyId } = ctx.query

  const matchStage: Record<string, unknown> = {}
  if (keyId) matchStage.keyId = keyId
  if (startDate || endDate) {
    const createdAt: Record<string, Date> = {}
    if (startDate) createdAt.$gte = new Date(startDate as string)
    if (endDate) createdAt.$lte = new Date(endDate as string)
    matchStage.createdAt = createdAt
  }

  const stats = await KeyUsageLogModel.aggregate([
    { $match: matchStage },
    { $match: { workflowId: { $ne: null } } },
    {
      $group: {
        _id: { workflowId: '$workflowId', keyId: '$keyId' },
        workflowName: { $first: '$workflowName' },
        keyName: { $first: '$keyName' },
        totalRequests: { $sum: 1 },
        successRequests: {
          $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] },
        },
        failedRequests: {
          $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
        },
        avgDuration: { $avg: '$duration' },
        lastUsedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { totalRequests: -1 } },
  ])

  ctx.body = {
    success: true,
    data: stats.map((stat) => ({
      workflowId: stat._id.workflowId,
      workflowName: stat.workflowName,
      keyId: stat._id.keyId,
      keyName: stat.keyName,
      totalRequests: stat.totalRequests,
      successRequests: stat.successRequests,
      failedRequests: stat.failedRequests,
      avgDuration: Math.round(stat.avgDuration),
      lastUsedAt: stat.lastUsedAt,
    })),
  }
})

export default router

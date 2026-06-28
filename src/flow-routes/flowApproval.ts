import Router from '@koa/router'
import { ApprovalLogModel } from '../flow-models/ApprovalLog.js'
import { authMiddleware } from '../middleware/auth.js'

const requireAuth = authMiddleware({ required: true })

const router = new Router({ prefix: '/api/flow-approvals' })

// GET /api/flow-approvals?instanceId=xxx
router.get('/', requireAuth, async (ctx) => {
  const { instanceId } = ctx.query
  if (!instanceId || typeof instanceId !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'instanceId is required' } }
    return
  }
  const page = Math.max(1, parseInt(ctx.query.page as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.pageSize as string) || 20))
  const filter = { instanceId }

  const [items, total] = await Promise.all([
    ApprovalLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    ApprovalLogModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
})

export default router

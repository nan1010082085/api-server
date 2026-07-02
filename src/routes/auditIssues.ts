/** S-09 — 审计问题 API */
import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { AuditIssueModel } from '../models/AuditIssue.js'
import { getCurrentTenantId } from '../middleware/tenantContext.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/audit/issues' })

router.get('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { status, page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const filter: Record<string, unknown> = { tenantId }
  if (status) filter.status = status

  const [items, total] = await Promise.all([
    AuditIssueModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    AuditIssueModel.countDocuments(filter),
  ])
  ctx.body = { success: true, data: { items, total, page, pageSize } }
})

router.get('/:id', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const issue = await AuditIssueModel.findOne({ _id: ctx.params.id, tenantId })
  if (!issue) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Issue not found' } }
    return
  }
  ctx.body = { success: true, data: issue }
})

router.post('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { title, description, severity = 'medium' } = ctx.request.body as {
    title: string
    description?: string
    severity?: 'low' | 'medium' | 'high'
  }
  if (!title?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'title is required' } }
    return
  }
  const issue = await AuditIssueModel.create({
    tenantId,
    title: title.trim(),
    description: description ?? '',
    severity,
    createdBy: (ctx.state.user as { id?: string })?.id ?? null,
  })
  ctx.status = 201
  ctx.body = { success: true, data: issue }
})

router.put('/:id', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { status, description } = ctx.request.body as { status?: string; description?: string }
  const issue = await AuditIssueModel.findOne({ _id: ctx.params.id, tenantId })
  if (!issue) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Issue not found' } }
    return
  }
  if (status) issue.status = status as typeof issue.status
  if (description !== undefined) issue.description = description
  await issue.save()
  ctx.body = { success: true, data: issue }
})

export default router

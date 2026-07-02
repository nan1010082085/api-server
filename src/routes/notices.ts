/** S-05 — 公告 CRUD API */
import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { NoticeModel } from '../models/Notice.js'
import { getCurrentTenantId } from '../middleware/tenantContext.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/notices' })

router.get('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { status, page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const filter: Record<string, unknown> = { tenantId }
  if (status) filter.status = status

  const [items, total] = await Promise.all([
    NoticeModel.find(filter).sort({ publishAt: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    NoticeModel.countDocuments(filter),
  ])

  ctx.body = { success: true, data: { items, total, page, pageSize } }
})

router.post('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { title, content, status = 'draft' } = ctx.request.body as {
    title: string
    content?: string
    status?: 'draft' | 'published'
  }
  if (!title?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'title is required' } }
    return
  }
  const notice = await NoticeModel.create({
    tenantId,
    title: title.trim(),
    content: content ?? '',
    status,
    publishAt: status === 'published' ? new Date() : null,
    createdBy: (ctx.state.user as { id?: string })?.id ?? null,
  })
  ctx.status = 201
  ctx.body = { success: true, data: notice }
})

router.get('/:id', requireAuth, async (ctx) => {
  const notice = await NoticeModel.findById(ctx.params.id)
  if (!notice) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Notice not found' } }
    return
  }
  ctx.body = { success: true, data: notice }
})

router.put('/:id', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { title, content, status } = ctx.request.body as {
    title?: string
    content?: string
    status?: 'draft' | 'published' | 'archived'
  }
  const notice = await NoticeModel.findById(ctx.params.id)
  if (!notice || notice.tenantId !== tenantId) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Notice not found' } }
    return
  }
  if (title !== undefined) notice.title = title.trim()
  if (content !== undefined) notice.content = content
  if (status !== undefined) {
    notice.status = status
    if (status === 'published' && !notice.publishAt) notice.publishAt = new Date()
  }
  await notice.save()
  ctx.body = { success: true, data: notice }
})

router.delete('/:id', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const result = await NoticeModel.deleteOne({ _id: ctx.params.id, tenantId })
  if (result.deletedCount === 0) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Notice not found' } }
    return
  }
  ctx.body = { success: true, data: { deleted: true } }
})

export default router

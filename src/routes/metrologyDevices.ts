/** S-10 — 计装器具 API */
import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { MetrologyDeviceModel } from '../models/MetrologyDevice.js'
import { getCurrentTenantId } from '../middleware/tenantContext.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/metrology/devices' })

function computeStatus(dueAt: Date | null | undefined): 'valid' | 'expiring' | 'expired' {
  if (!dueAt) return 'valid'
  const now = Date.now()
  const due = dueAt.getTime()
  if (due < now) return 'expired'
  const days = (due - now) / (86400000)
  return days <= 30 ? 'expiring' : 'valid'
}

router.get('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { status, page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const filter: Record<string, unknown> = { tenantId }
  if (status) filter.status = status

  const [rawItems, total] = await Promise.all([
    MetrologyDeviceModel.find(filter).sort({ calibrationDueAt: 1 }).skip((page - 1) * pageSize).limit(pageSize),
    MetrologyDeviceModel.countDocuments(filter),
  ])
  const items = rawItems.map((d) => {
    const json = d.toJSON() as Record<string, unknown>
    json.expiryStatus = computeStatus(d.calibrationDueAt)
    json.daysUntilDue = d.calibrationDueAt
      ? Math.ceil((d.calibrationDueAt.getTime() - Date.now()) / 86400000)
      : null
    return json
  })
  ctx.body = { success: true, data: { items, total, page, pageSize } }
})

router.post('/', requireAuth, async (ctx) => {
  const tenantId = getCurrentTenantId(ctx)
  const { name, code, category, calibrationDueAt, location } = ctx.request.body as {
    name: string
    code: string
    category?: string
    calibrationDueAt?: string
    location?: string
  }
  if (!name?.trim() || !code?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'name and code are required' } }
    return
  }
  const due = calibrationDueAt ? new Date(calibrationDueAt) : null
  const device = await MetrologyDeviceModel.create({
    tenantId,
    name: name.trim(),
    code: code.trim(),
    category: category ?? 'general',
    calibrationDueAt: due,
    location: location ?? null,
    status: computeStatus(due),
  })
  ctx.status = 201
  ctx.body = { success: true, data: device }
})

export default router

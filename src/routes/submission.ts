import Router from '@koa/router'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  createSubmissionSchema,
  updateSubmissionStatusSchema,
  batchDeleteSubmissionsSchema,
  batchUpdateSubmissionsStatusSchema,
} from '../schemas/submissionSchemas.js'
import { eventBus } from '../services/eventBus.js'
import {
  exportToCsv,
  exportToExcel,
  extractFieldLabels,
  buildExportFields,
  type ExportFormat,
} from '../services/exportService.js'
import type { SubmissionStatus } from '../models/FormSubmission.js'
import mongoose from 'mongoose'
import { enrichSubmissions, enrichSubmission, toLeaveDetailView, normalizeSubmissionData } from '../services/business/submissionEnrichment.js'

const requireAuth = authMiddleware({ required: true })

const router = new Router({ prefix: '/api/submissions' })

// ────────────────────────────────────────────
// GET /api/submissions/record/:id/view
// 按 submissionId 查询详情视图（无需 schemaId 参数）
// ────────────────────────────────────────────
router.get('/record/:id/view', requireAuth, async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const submission = await FormSubmissionModel.findById(id)
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const enriched = await enrichSubmission(submission)
  ctx.body = { success: true, data: toLeaveDetailView(enriched) }
})

// ────────────────────────────────────────────
// GET /api/submissions/record/:id/export
// 导出单条 submission（CSV / Excel）
// ────────────────────────────────────────────
router.get('/record/:id/export', requireAuth, async (ctx) => {
  const { id } = ctx.params
  const { format: formatParam } = ctx.query

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const submission = await FormSubmissionModel.findById(id)
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const format: ExportFormat = formatParam === 'xlsx' ? 'xlsx' : 'csv'
  const schemaId = String(submission.schemaId)
  const schema = await FormSchemaModel.findById(schemaId).lean() as Record<string, unknown> | null
  const fieldLabels = schema ? extractFieldLabels(schema.json as Record<string, unknown>) : {}
  const fields = buildExportFields([submission], fieldLabels)
  const safeName = ((schema?.name as string) ?? schemaId).replace(/[^\w一-鿿-]/g, '_')

  if (format === 'xlsx') {
    const buffer = await exportToExcel([submission], fields)
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ctx.set('Content-Disposition', `attachment; filename="submission-${safeName}.xlsx"`)
    ctx.body = buffer
  } else {
    const csv = exportToCsv([submission], fields)
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set('Content-Disposition', `attachment; filename="submission-${safeName}.csv"`)
    ctx.body = csv
  }
})

// ────────────────────────────────────────────
// POST /api/submissions/:schemaId
// 提交表单数据
// ────────────────────────────────────────────
router.post('/:schemaId', requireAuth, validate(createSubmissionSchema), async (ctx) => {
  const { schemaId } = ctx.params
  const { data, submitterId } = ctx.request.body as { data: Record<string, unknown>; submitterId?: string }

  if (!mongoose.Types.ObjectId.isValid(schemaId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid schemaId UUID format.' } }
    return
  }

  // 验证关联的 schema 存在
  const schema = await FormSchemaModel.findById(schemaId)
  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Form schema not found.' } }
    return
  }

  const userId = (ctx.state.user as { id: string }).id

  const normalizedData = normalizeSubmissionData(schema.code ?? null, data)

  const submission = await FormSubmissionModel.create({
    schemaId,
    data: normalizedData,
    submitterId: submitterId ?? userId,
    status: 'submitted',
  })

  ctx.status = 201
  ctx.body = { success: true, data: submission }

  // Fire-and-forget webhook event
  eventBus.emit('submission.created', {
    submissionId: submission._id,
    schemaId,
    submitterId: submission.submitterId ?? userId,
    data: normalizedData,
  }).catch((err) => console.error('[submission.created] emit failed:', err))
})

// ────────────────────────────────────────────
// GET /api/submissions/:schemaId
// 查询某表单的所有提交（分页 + 状态筛选）
// ────────────────────────────────────────────
router.get('/:schemaId', requireAuth, async (ctx) => {
  const { schemaId } = ctx.params
  const { status, page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query

  if (!mongoose.Types.ObjectId.isValid(schemaId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid schemaId UUID format.' } }
    return
  }

  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const skip = (page - 1) * pageSize

  const filter: Record<string, unknown> = { schemaId }
  if (status && ['submitted', 'approved', 'rejected'].includes(status as string)) {
    filter.status = status as SubmissionStatus
  }

  const [items, total] = await Promise.all([
    FormSubmissionModel.find(filter).skip(skip).limit(pageSize).sort({ createdAt: -1 }),
    FormSubmissionModel.countDocuments(filter),
  ])

  const enrich = ctx.query.enrich !== 'false'
  const viewerId = (ctx.state.user as { id?: string })?.id ?? null
  const payloadItems = enrich ? await enrichSubmissions(items, viewerId) : items

  ctx.body = {
    success: true,
    data: {
      items: payloadItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/submissions/:schemaId/export
// 导出为 CSV 或 Excel
// 查询参数：status, format (csv | xlsx)
// ────────────────────────────────────────────
router.get('/:schemaId/export', requireAuth, async (ctx) => {
  const { schemaId } = ctx.params
  const { status, format: formatParam } = ctx.query

  if (!mongoose.Types.ObjectId.isValid(schemaId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid schemaId UUID format.' } }
    return
  }

  const format: ExportFormat = formatParam === 'xlsx' ? 'xlsx' : 'csv'

  const filter: Record<string, unknown> = { schemaId }
  if (status && ['submitted', 'approved', 'rejected'].includes(status as string)) {
    filter.status = status as SubmissionStatus
  }

  const submissions = await FormSubmissionModel.find(filter).sort({ createdAt: -1 })

  if (submissions.length === 0) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'No submissions found to export.' } }
    return
  }

  // 从 Schema JSON 中提取字段 label 映射
  const schema = await FormSchemaModel.findById(schemaId).lean() as Record<string, unknown> | null
  const fieldLabels = schema ? extractFieldLabels(schema.json as Record<string, unknown>) : {}

  // 构建导出字段列表
  const fields = buildExportFields(submissions, fieldLabels)

  const safeName = ((schema?.name as string) ?? schemaId).replace(/[^\w一-鿿-]/g, '_')

  if (format === 'xlsx') {
    const buffer = await exportToExcel(submissions, fields)
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ctx.set('Content-Disposition', `attachment; filename="submissions-${safeName}.xlsx"`)
    ctx.body = buffer
  } else {
    const csv = exportToCsv(submissions, fields)
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set('Content-Disposition', `attachment; filename="submissions-${safeName}.csv"`)
    ctx.body = csv
  }
})

// ────────────────────────────────────────────
// GET /api/submissions/:schemaId/:id
// 查询单条提交详情
// ────────────────────────────────────────────
router.get('/:schemaId/:id', requireAuth, async (ctx) => {
  const { schemaId, id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(schemaId) || !mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const submission = await FormSubmissionModel.findOne({ _id: id, schemaId })
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const enriched = await enrichSubmission(submission)
  ctx.body = { success: true, data: enriched }
})

// ────────────────────────────────────────────
// GET /api/submissions/:schemaId/:id/view
// 详情页扁平视图（descriptions 组件）
// ────────────────────────────────────────────
router.get('/:schemaId/:id/view', requireAuth, async (ctx) => {
  const { schemaId, id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(schemaId) || !mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const submission = await FormSubmissionModel.findOne({ _id: id, schemaId })
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const enriched = await enrichSubmission(submission)
  ctx.body = { success: true, data: toLeaveDetailView(enriched) }
})

// ────────────────────────────────────────────
// PATCH /api/submissions/:schemaId/:id/status
// 更新提交状态（审批/驳回）
// ────────────────────────────────────────────
router.patch('/:schemaId/:id/status', requireAuth, validate(updateSubmissionStatusSchema), async (ctx) => {
  const { schemaId, id } = ctx.params
  const { status } = ctx.request.body as { status: SubmissionStatus }

  if (!mongoose.Types.ObjectId.isValid(schemaId) || !mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const submission = await FormSubmissionModel.findOneAndUpdate(
    { _id: id, schemaId },
    { $set: { status } },
    { new: true },
  )

  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  ctx.body = { success: true, data: submission }
})

// ────────────────────────────────────────────
// DELETE /api/submissions/:schemaId/:id
// 删除提交
// ────────────────────────────────────────────
router.delete('/:schemaId/:id', requireAuth, async (ctx) => {
  const { schemaId, id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(schemaId) || !mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const result = await FormSubmissionModel.findOneAndDelete({ _id: id, schemaId })
  if (!result) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  ctx.status = 200
  ctx.body = { success: true, data: null }
})

// ────────────────────────────────────────────
// POST /api/submissions/:schemaId/batch/delete
// 批量删除提交
// ────────────────────────────────────────────
router.post('/:schemaId/batch/delete', requireAuth, validate(batchDeleteSubmissionsSchema), async (ctx) => {
  const { schemaId } = ctx.params
  const { ids } = ctx.request.body as { ids: string[] }

  if (!mongoose.Types.ObjectId.isValid(schemaId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid schemaId UUID format.' } }
    return
  }

  const result = await FormSubmissionModel.deleteMany({
    _id: { $in: ids },
    schemaId,
  })

  ctx.status = 200
  ctx.body = { success: true, data: { deletedCount: result.deletedCount } }
})

// ────────────────────────────────────────────
// POST /api/submissions/:schemaId/batch/status
// 批量更新提交状态
// ────────────────────────────────────────────
router.post('/:schemaId/batch/status', requireAuth, validate(batchUpdateSubmissionsStatusSchema), async (ctx) => {
  const { schemaId } = ctx.params
  const { ids, status } = ctx.request.body as { ids: string[]; status: SubmissionStatus }

  if (!mongoose.Types.ObjectId.isValid(schemaId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid schemaId UUID format.' } }
    return
  }

  const result = await FormSubmissionModel.updateMany(
    { _id: { $in: ids }, schemaId },
    { $set: { status } },
  )

  ctx.status = 200
  ctx.body = { success: true, data: { modifiedCount: result.modifiedCount } }
})

export default router

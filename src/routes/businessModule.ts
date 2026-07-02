/**
 * 业务平台模块 API — 与 schema-form-shell/docs/business-platform 模块对齐
 *
 * 前缀 /api/business/{module}/...
 * 通用 CRUD 仍走 /api/users、/api/submissions 等基础路由。
 */

import Router from '@koa/router'
import mongoose from 'mongoose'
import { authMiddleware } from '../middleware/auth.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { getHrLeaveStats } from '../services/business/hrLeaveStatsService.js'
import { resolveFormSchemaIdByCode } from '../services/business/schemaCodeResolver.js'
import {
  enrichSubmission,
  toLeaveDetailView,
} from '../services/business/submissionEnrichment.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/business' })

// ── 人事 / 请假 ──

/** GET /api/business/hr/leave/stats — HR-03 请假统计页 */
router.get('/hr/leave/stats', requireAuth, async (ctx) => {
  const data = await getHrLeaveStats()
  ctx.body = { success: true, data }
})

/**
 * GET /api/business/hr/leave/detail?recordId=
 * 请假详情 descriptions 数据源（需 URL 带 recordId，PublishView ?recordId= 注入后由前端拼 query）
 */
router.get('/hr/leave/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required and must be a valid id.' } }
    return
  }

  const schemaId = await resolveFormSchemaIdByCode('hr-leave-apply')
  if (!schemaId) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Leave apply schema not found.' } }
    return
  }

  const submission = await FormSubmissionModel.findOne({ _id: recordId, schemaId })
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const enriched = await enrichSubmission(submission)
  ctx.body = { success: true, data: toLeaveDetailView(enriched) }
})

/** GET /api/business/hr/leave/schemas — 模块 Schema 元信息（菜单/debug） */
router.get('/hr/leave/schemas', requireAuth, async (ctx) => {
  const codes = ['hr-leave-apply', 'hr-leave-list', 'hr-leave-detail', 'hr-leave-stats'] as const
  const entries = await Promise.all(
    codes.map(async (code) => ({
      code,
      formSchemaId: await resolveFormSchemaIdByCode(code),
    })),
  )
  ctx.body = { success: true, data: { schemas: entries } }
})

export default router

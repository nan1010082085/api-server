/**
 * 业务平台模块 API — 与 shell/docs/business-platform 模块对齐
 *
 * 前缀 /api/business/{module}/...
 * 通用 CRUD 仍走 /api/users、/api/submissions 等基础路由。
 */

import Router from '@koa/router'
import mongoose from 'mongoose'
import { authMiddleware } from '../middleware/auth.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { getHrLeaveStats } from '../services/business/hrLeaveStatsService.js'
import {
  getFinMonthlyClose,
  getFinLedgerBalance,
} from '../services/business/finFinanceReportService.js'
import { getReportAggregate, type ReportModuleKey } from '../services/business/reportAggregateService.js'
import { resolveFormSchemaIdByCode } from '../services/business/schemaCodeResolver.js'
import {
  enrichSubmission,
  type SubmissionDoc,
  toLeaveDetailView,
  toOaTripDetailView,
  toOaSealDetailView,
  toOaDocReceiveDetailView,
  toOaDocDraftDetailView,
  toHrOvertimeDetailView,
  toFinExpenseDetailView,
  toFinPurchaseDetailView,
  toFinPaymentDetailView,
  toHrOnboardDetailView,
  toGovCaseDetailView,
  toHrResignDetailView,
  toHrRecruitDetailView,
  toGovLicenseDetailView,
  toOaMeetingDetailView,
  toOaAssetDetailView,
  toFinInvoiceDetailView,
  toFinBudgetDetailView,
  toEquipRequisitionDetailView,
} from '../services/business/submissionEnrichment.js'
import { notificationService } from '../flow-services/NotificationService.js'
import { NoticeModel } from '../models/Notice.js'
import { AuditIssueModel } from '../models/AuditIssue.js'
import { getCurrentTenantId } from '../middleware/tenantContext.js'
import { leanDoc } from '../utils/leanDoc.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/business' })

// ── 人事 / 请假 ──

/** GET /api/business/hr/leave/stats — HR-03 请假统计页 */
router.get('/hr/leave/stats', requireAuth, async (ctx) => {
  const data = await getHrLeaveStats()
  ctx.body = { success: true, data }
})

/**
 * GET /api/business/hr/leave/detail?recordId=&taskId=
 * 请假详情 descriptions 数据源（可选 taskId 覆盖当前用户 pending task）
 */
router.get('/hr/leave/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
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

  const enriched = await enrichSubmission(
    submission,
    (ctx.state.user as { id?: string })?.id ?? null,
  )
  const detail = toLeaveDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) {
    detail.taskId = taskIdOverride
  }
  ctx.body = { success: true, data: detail }
})

// ── OA / 出差 ──

/** GET /api/business/oa/trip/detail?recordId=&taskId= */
router.get('/oa/trip/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId || !mongoose.Types.ObjectId.isValid(recordId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required and must be a valid id.' } }
    return
  }

  const schemaId = await resolveFormSchemaIdByCode('oa-trip-apply')
  if (!schemaId) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Trip apply schema not found.' } }
    return
  }

  const submission = await FormSubmissionModel.findOne({ _id: recordId, schemaId })
  if (!submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }

  const enriched = await enrichSubmission(
    submission,
    (ctx.state.user as { id?: string })?.id ?? null,
  )
  const detail = toOaTripDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) {
    detail.taskId = taskIdOverride
  }
  ctx.body = { success: true, data: detail }
})

async function loadSubmissionDetail(
  recordId: string,
  schemaCode: string,
): Promise<{ submission: SubmissionDoc } | null> {
  if (!mongoose.Types.ObjectId.isValid(recordId)) return null
  const schemaId = await resolveFormSchemaIdByCode(schemaCode)
  if (!schemaId) return null
  const submission = await FormSubmissionModel.findOne({ _id: recordId, schemaId })
  if (!submission) return null
  return { submission: submission as SubmissionDoc }
}

/** GET /api/business/oa/seal/detail?recordId= */
router.get('/oa/seal/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'oa-seal-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toOaSealDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/oa/doc/receive/detail?recordId= */
router.get('/oa/doc/receive/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'oa-doc-receive')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toOaDocReceiveDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/oa/doc/draft/detail?recordId= */
router.get('/oa/doc/draft/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'oa-doc-draft')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toOaDocDraftDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/hr/overtime/detail?recordId= */
router.get('/hr/overtime/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'hr-overtime-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toHrOvertimeDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/fin/expense/detail?recordId= */
router.get('/fin/expense/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'fin-expense-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toFinExpenseDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/oa/asset/detail?recordId= */
router.get('/oa/asset/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'oa-asset-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toOaAssetDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/oa/meeting/detail?recordId= */
router.get('/oa/meeting/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'oa-meeting-book')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toOaMeetingDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/gov/license/detail?recordId= */
router.get('/gov/license/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'gov-license-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toGovLicenseDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/hr/recruit/detail?recordId= */
router.get('/hr/recruit/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'hr-recruit-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toHrRecruitDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/hr/resign/detail?recordId= */
router.get('/hr/resign/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'hr-resign-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toHrResignDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/gov/case/detail?recordId= */
router.get('/gov/case/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'gov-case-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toGovCaseDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/hr/onboard/detail?recordId= */
router.get('/hr/onboard/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'hr-onboard-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toHrOnboardDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/fin/purchase/detail?recordId= */
router.get('/fin/purchase/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'fin-purchase-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toFinPurchaseDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/fin/payment/detail?recordId= */
router.get('/fin/payment/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'fin-payment-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toFinPaymentDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/fin/invoice/detail?recordId= */
router.get('/fin/invoice/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'fin-invoice-register')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toFinInvoiceDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/fin/budget/detail?recordId= */
router.get('/fin/budget/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'fin-budget-edit')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toFinBudgetDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
})

/** GET /api/business/audit/issue/detail?recordId= */
router.get('/audit/issue/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const tenantId = getCurrentTenantId(ctx)
  const issue = leanDoc<{
    _id?: unknown
    title?: string
    severity?: string
    status?: string
    description?: string
  }>(await AuditIssueModel.findOne({ _id: recordId, tenantId }).lean())
  if (!issue) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Issue not found.' } }
    return
  }
  const severityLabels: Record<string, string> = { low: '低', medium: '中', high: '高' }
  const statusLabels: Record<string, string> = { open: '待整改', in_progress: '整改中', closed: '已关闭' }
  ctx.body = {
    success: true,
    data: {
      recordId: String(issue._id),
      title: issue.title ?? '—',
      severity: severityLabels[issue.severity ?? ''] ?? issue.severity ?? '—',
      status: statusLabels[issue.status ?? ''] ?? issue.status ?? '—',
      description: issue.description ?? '—',
    },
  }
})

/** GET /api/business/equip/requisition/detail?recordId= */
router.get('/equip/requisition/detail', requireAuth, async (ctx) => {
  const recordId = ctx.query.recordId as string
  const taskIdOverride = ctx.query.taskId as string | undefined
  if (!recordId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Query recordId is required.' } }
    return
  }
  const loaded = await loadSubmissionDetail(recordId, 'equip-requisition-apply')
  if (!loaded?.submission) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Submission not found.' } }
    return
  }
  const enriched = await enrichSubmission(loaded.submission, (ctx.state.user as { id?: string })?.id ?? null)
  const detail = toEquipRequisitionDetailView(enriched)
  if (taskIdOverride && mongoose.Types.ObjectId.isValid(taskIdOverride)) detail.taskId = taskIdOverride
  ctx.body = { success: true, data: detail }
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

// ── 财务 / 月结 & 科目余额（S-12 聚合）──

/** GET /api/business/finance/monthly-close — FI-14 财务月结 */
router.get('/finance/monthly-close', requireAuth, async (ctx) => {
  const { page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const data = await getFinMonthlyClose({ page, pageSize })
  ctx.body = { success: true, data }
})

/** GET /api/business/finance/ledger-balance — FI-17 科目余额 */
router.get('/finance/ledger-balance', requireAuth, async (ctx) => {
  const { page: pageStr = '1', pageSize: pageSizeStr = '20' } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const data = await getFinLedgerBalance({ page, pageSize })
  ctx.body = { success: true, data }
})

// ── 报表聚合（S-11）──

/** GET /api/business/reports/aggregate?module=hr|oa|finance|audit|gov|all */
router.get('/reports/aggregate', requireAuth, async (ctx) => {
  const raw = (ctx.query.module as string | undefined) ?? 'all'
  const allowed: ReportModuleKey[] = ['hr', 'oa', 'finance', 'audit', 'gov', 'all']
  const module = allowed.includes(raw as ReportModuleKey) ? (raw as ReportModuleKey) : 'all'
  const data = await getReportAggregate(module)
  ctx.body = { success: true, data }
})

// ── 工作台 / 通知（S-04）──

/** GET /api/business/notifications — 聚合流程通知 + 公告未读提示 */
router.get('/notifications', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const { page: pageStr = '1', pageSize: pageSizeStr = '20', unreadOnly: unreadOnlyStr } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))
  const unreadOnly = unreadOnlyStr === 'true'

  const flow = await notificationService.getNotifications(userId, { page, pageSize, unreadOnly })
  const tenantId = getCurrentTenantId() ?? '000000'
  const publishedNotices = await NoticeModel.countDocuments({ tenantId, status: 'published' })

  ctx.body = {
    success: true,
    data: {
      ...flow,
      publishedNotices,
    },
  }
})

/** GET /api/business/notifications/unread-count */
router.get('/notifications/unread-count', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const count = await notificationService.getUnreadCount(userId)
  ctx.body = { success: true, data: { count } }
})

/** PUT /api/business/notifications/:id/read */
router.put('/notifications/:id/read', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const notification = await notificationService.markAsRead(ctx.params.id, userId)
  if (!notification) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Notification not found.' } }
    return
  }
  ctx.body = { success: true, data: notification }
})

/** PUT /api/business/notifications/read-all */
router.put('/notifications/read-all', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const modifiedCount = await notificationService.markAllAsRead(userId)
  ctx.body = { success: true, data: { modifiedCount } }
})

export default router

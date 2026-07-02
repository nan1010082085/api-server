import { FormSubmissionModel } from '../../models/FormSubmission.js'
import { FormSchemaModel } from '../../models/FormSchema.js'
import { DEFAULT_TENANT_ID } from '../../utils/initDefaultTenant.js'

export type ReportModuleKey = 'hr' | 'oa' | 'finance' | 'audit' | 'gov' | 'all'

const MODULE_SCHEMA_CODES: Record<Exclude<ReportModuleKey, 'all'>, readonly string[]> = {
  hr: [
    'hr-leave-apply',
    'hr-overtime-apply',
    'hr-onboard-apply',
    'hr-resign-apply',
    'hr-recruit-apply',
    'hr-recruit-offer',
  ],
  oa: [
    'oa-trip-apply',
    'oa-seal-apply',
    'oa-doc-receive',
    'oa-doc-draft',
    'oa-asset-apply',
    'oa-notice-publish',
  ],
  finance: [
    'fin-expense-apply',
    'fin-purchase-apply',
    'fin-payment-apply',
    'fin-invoice-register',
    'fin-budget-edit',
  ],
  audit: ['audit-plan-edit', 'audit-report-edit', 'audit-compliance-form'],
  gov: ['gov-case-apply', 'gov-case-accept', 'gov-license-apply'],
}

const SCHEMA_LABELS: Record<string, string> = {
  'hr-leave-apply': '请假',
  'hr-overtime-apply': '加班',
  'hr-onboard-apply': '入职',
  'hr-resign-apply': '离职',
  'hr-recruit-apply': '招聘需求',
  'hr-recruit-offer': 'Offer',
  'oa-trip-apply': '出差',
  'oa-seal-apply': '用印',
  'oa-doc-receive': '收文',
  'oa-doc-draft': '拟稿',
  'oa-asset-apply': '资产领用',
  'oa-notice-publish': '公告',
  'fin-expense-apply': '报销',
  'fin-purchase-apply': '采购',
  'fin-payment-apply': '付款',
  'fin-invoice-register': '发票',
  'fin-budget-edit': '预算',
  'audit-plan-edit': '审计计划',
  'audit-report-edit': '审计报告',
  'audit-compliance-form': '合规检查',
  'gov-case-apply': '政务事项',
  'gov-case-accept': '事项受理',
  'gov-license-apply': '证照申请',
}

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function extractAmount(data: Record<string, unknown>): number {
  for (const key of ['totalAmount', 'amount', 'budgetAmount']) {
    const n = Number(data[key])
    if (Number.isFinite(n)) return n
  }
  return 0
}

export interface ReportAggregateRow {
  schemaCode: string
  label: string
  total: number
  pending: number
  approved: number
  rejected: number
  amount: number
}

export interface ReportAggregatePayload {
  module: ReportModuleKey
  monthStart: string
  totalSubmissions: number
  rows: ReportAggregateRow[]
}

function resolveCodes(module: ReportModuleKey): string[] {
  if (module === 'all') {
    return Object.values(MODULE_SCHEMA_CODES).flat()
  }
  return [...MODULE_SCHEMA_CODES[module]]
}

/** S-11 跨模块报表聚合 — 按 schemaCode 统计当月 submission */
export async function getReportAggregate(
  module: ReportModuleKey = 'all',
): Promise<ReportAggregatePayload> {
  const codes = resolveCodes(module)
  const schemas = await FormSchemaModel.find({
    tenantId: DEFAULT_TENANT_ID,
    code: { $in: codes },
  }).select('_id code').lean()

  const codeBySchemaId = new Map(schemas.map((s) => [String(s._id), String(s.code)]))
  const schemaIds = [...codeBySchemaId.keys()]
  const monthStart = startOfMonth()

  if (schemaIds.length === 0) {
    return {
      module,
      monthStart: monthStart.toISOString(),
      totalSubmissions: 0,
      rows: [],
    }
  }

  const docs = await FormSubmissionModel.find({
    schemaId: { $in: schemaIds },
    createdAt: { $gte: monthStart },
  }).select('schemaId status data').lean()

  const bucket = new Map<string, ReportAggregateRow>()

  for (const code of codes) {
    bucket.set(code, {
      schemaCode: code,
      label: SCHEMA_LABELS[code] ?? code,
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      amount: 0,
    })
  }

  for (const doc of docs) {
    const code = codeBySchemaId.get(String(doc.schemaId))
    if (!code) continue
    const row = bucket.get(code)
    if (!row) continue
    row.total += 1
    const status = String(doc.status ?? '')
    if (status === 'submitted' || status === 'pending') row.pending += 1
    else if (status === 'approved') row.approved += 1
    else if (status === 'rejected') row.rejected += 1
    row.amount += extractAmount((doc.data ?? {}) as Record<string, unknown>)
  }

  const rows = [...bucket.values()].filter((r) => r.total > 0 || codes.includes(r.schemaCode))
  const totalSubmissions = rows.reduce((sum, r) => sum + r.total, 0)

  return {
    module,
    monthStart: monthStart.toISOString(),
    totalSubmissions,
    rows,
  }
}

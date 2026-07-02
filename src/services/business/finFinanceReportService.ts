import { FormSubmissionModel } from '../../models/FormSubmission.js'
import { FormSchemaModel } from '../../models/FormSchema.js'
import { DEFAULT_TENANT_ID } from '../../utils/initDefaultTenant.js'

const FINANCE_SUBMISSION_CODES = [
  'fin-expense-apply',
  'fin-purchase-apply',
  'fin-payment-apply',
  'fin-invoice-register',
  'fin-budget-edit',
] as const

const MODULE_LABELS: Record<string, string> = {
  'fin-expense-apply': '报销',
  'fin-purchase-apply': '采购',
  'fin-payment-apply': '付款',
  'fin-invoice-register': '发票',
  'fin-budget-edit': '预算',
}

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function extractAmount(data: Record<string, unknown>): number {
  for (const key of ['totalAmount', 'amount', 'budgetAmount', 'taxAmount']) {
    const n = Number(data[key])
    if (Number.isFinite(n)) return n
  }
  if (Array.isArray(data.items)) {
    return data.items.reduce((sum, row) => {
      const amount = typeof row === 'object' && row !== null
        ? Number((row as Record<string, unknown>).amount)
        : 0
      return sum + (Number.isFinite(amount) ? amount : 0)
    }, 0)
  }
  return 0
}

async function resolveFinanceSchemaMap(): Promise<Map<string, string>> {
  const docs = await FormSchemaModel.find({
    tenantId: DEFAULT_TENANT_ID,
    code: { $in: [...FINANCE_SUBMISSION_CODES] },
  }).select('_id code').lean()
  return new Map(docs.map((d) => [String(d._id), String(d.code)]))
}

export interface FinanceReportListOptions {
  page?: number
  pageSize?: number
}

export interface FinanceMonthlyCloseItem {
  id: string
  title: string
  module: string
  amount: number
  status: string
  createdAt: Date
}

export interface FinanceMonthlyClosePayload {
  total: number
  items: FinanceMonthlyCloseItem[]
  page: number
  pageSize: number
  totalItems: number
}

/** FI-14 财务月结 — 当月财务 submission 汇总，待月结=status submitted */
export async function getFinMonthlyClose(
  opts: FinanceReportListOptions = {},
): Promise<FinanceMonthlyClosePayload> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
  const schemaMap = await resolveFinanceSchemaMap()
  const schemaIds = [...schemaMap.keys()]
  if (schemaIds.length === 0) {
    return { total: 0, items: [], page, pageSize, totalItems: 0 }
  }

  const monthStart = startOfMonth()
  const filter = { schemaId: { $in: schemaIds }, createdAt: { $gte: monthStart } }

  const [total, totalItems, docs] = await Promise.all([
    FormSubmissionModel.countDocuments({ ...filter, status: 'submitted' }),
    FormSubmissionModel.countDocuments(filter),
    FormSubmissionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ])

  const items: FinanceMonthlyCloseItem[] = docs.map((doc) => {
    const data = doc.data as Record<string, unknown>
    const code = schemaMap.get(String(doc.schemaId)) ?? 'finance'
    return {
      id: String(doc._id),
      title: String(data.title ?? data.invoiceNo ?? MODULE_LABELS[code] ?? code),
      module: MODULE_LABELS[code] ?? code,
      amount: extractAmount(data),
      status: doc.status,
      createdAt: doc.createdAt as Date,
    }
  })

  return { total, items, page, pageSize, totalItems }
}

export interface FinanceLedgerItem {
  subject: string
  budgetAmount: number
  actualAmount: number
  balance: number
}

export interface FinanceLedgerBalancePayload {
  total: number
  items: FinanceLedgerItem[]
  page: number
  pageSize: number
  totalItems: number
}

/** FI-17 科目余额 — 预算编制 + 报销/付款发生额按科目归集 */
export async function getFinLedgerBalance(
  opts: FinanceReportListOptions = {},
): Promise<FinanceLedgerBalancePayload> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20))
  const schemaMap = await resolveFinanceSchemaMap()
  const schemaIds = [...schemaMap.keys()]
  if (schemaIds.length === 0) {
    return { total: 0, items: [], page, pageSize, totalItems: 0 }
  }

  const monthStart = startOfMonth()
  const docs = await FormSubmissionModel.find({
    schemaId: { $in: schemaIds },
    createdAt: { $gte: monthStart },
    status: { $in: ['submitted', 'approved'] },
  }).lean()

  const ledger = new Map<string, { budgetAmount: number; actualAmount: number }>()

  for (const doc of docs) {
    const data = doc.data as Record<string, unknown>
    const code = schemaMap.get(String(doc.schemaId)) ?? ''
    const amount = extractAmount(data)

    if (code === 'fin-budget-edit') {
      const subject = String(data.subject ?? '未命名科目')
      const prev = ledger.get(subject) ?? { budgetAmount: 0, actualAmount: 0 }
      prev.budgetAmount += amount
      ledger.set(subject, prev)
      continue
    }

    const subject = String(data.subject ?? data.department ?? MODULE_LABELS[code] ?? '期间费用')
    const prev = ledger.get(subject) ?? { budgetAmount: 0, actualAmount: 0 }
    prev.actualAmount += amount
    ledger.set(subject, prev)
  }

  const allItems: FinanceLedgerItem[] = [...ledger.entries()]
    .map(([subject, { budgetAmount, actualAmount }]) => ({
      subject,
      budgetAmount: Math.round(budgetAmount * 100) / 100,
      actualAmount: Math.round(actualAmount * 100) / 100,
      balance: Math.round((budgetAmount - actualAmount) * 100) / 100,
    }))
    .sort((a, b) => b.actualAmount - a.actualAmount)

  const totalItems = allItems.length
  const items = allItems.slice((page - 1) * pageSize, page * pageSize)

  return { total: totalItems, items, page, pageSize, totalItems }
}

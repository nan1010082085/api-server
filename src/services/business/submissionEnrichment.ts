import type { IFormSubmission } from '../../models/FormSubmission.js'
import { UserModel } from '../../models/User.js'
import { DeptModel } from '../../models/Dept.js'
import { FlowInstanceModel } from '../../flow-models/FlowInstance.js'
import { TaskInstanceModel } from '../../flow-models/TaskInstance.js'
import {
  LEAVE_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  FLOW_STATUS_LABELS,
} from './leaveTypeLabels.js'
import { leanDoc } from '../../utils/leanDoc.js'

export interface EnrichedSubmission {
  id: string
  schemaId: string
  data: Record<string, unknown>
  submitterId: string | null
  status: string
  flowInstanceId: string | null
  createdAt: Date
  updatedAt: Date
  submitterName: string | null
  deptName: string | null
  flowStatus: string | null
  flowStatusLabel: string | null
  currentTaskName: string | null
  viewerTaskId: string | null
}

export type SubmissionDoc = IFormSubmission & { _id: unknown; toJSON?: () => Record<string, unknown> }

function toPlainSubmission(doc: SubmissionDoc): Record<string, unknown> {
  if (typeof doc.toJSON === 'function') return doc.toJSON()
  return doc as unknown as Record<string, unknown>
}

export async function enrichSubmission(
  doc: SubmissionDoc,
  viewerId?: string | null,
): Promise<EnrichedSubmission> {
  const plain = toPlainSubmission(doc)
  const submitterId = (plain.submitterId as string | null) ?? null
  const flowInstanceId = (plain.flowInstanceId as string | null) ?? null

  let submitterName: string | null = null
  let deptName: string | null = null

  if (submitterId) {
    const user = leanDoc<{ displayName?: string; deptId?: string }>(
      await UserModel.findById(submitterId).select('displayName deptId').lean(),
    )
    if (user) {
      submitterName = user.displayName ?? null
      if (user.deptId) {
        const dept = leanDoc<{ name?: string }>(
          await DeptModel.findById(user.deptId).select('name').lean(),
        )
        deptName = dept?.name ?? null
      }
    }
  }

  let flowStatus: string | null = null
  let flowStatusLabel: string | null = null
  let currentTaskName: string | null = null
  let viewerTaskId: string | null = null

  if (flowInstanceId) {
    const flow = leanDoc<{ status?: string }>(
      await FlowInstanceModel.findById(flowInstanceId).select('status').lean(),
    )
    if (flow?.status) {
      flowStatus = flow.status
      flowStatusLabel = FLOW_STATUS_LABELS[flow.status] ?? flow.status
    }
    const taskFilter: Record<string, unknown> = {
      instanceId: flowInstanceId,
      status: { $in: ['pending', 'claimed'] },
    }
    if (viewerId) {
      taskFilter.$or = [{ assignee: viewerId }, { assignee: null }, { assignee: { $exists: false } }]
    }
    const task = leanDoc<{ nodeName?: string; _id?: unknown; assignee?: string | null }>(
      await TaskInstanceModel.findOne(taskFilter)
        .sort({ createdAt: -1 })
        .select('nodeName _id assignee')
        .lean(),
    )
    currentTaskName = task?.nodeName ?? null
    if (task && viewerId && (task.assignee === viewerId || !task.assignee)) {
      viewerTaskId = String(task._id)
    } else if (task && !viewerId) {
      viewerTaskId = String(task._id)
    }
  }

  return {
    id: String(plain.id ?? plain._id),
    schemaId: String(plain.schemaId),
    data: (plain.data as Record<string, unknown>) ?? {},
    submitterId,
    status: String(plain.status),
    flowInstanceId,
    createdAt: plain.createdAt as Date,
    updatedAt: plain.updatedAt as Date,
    submitterName,
    deptName,
    flowStatus,
    flowStatusLabel,
    currentTaskName,
    viewerTaskId,
  }
}

export async function enrichSubmissions(
  docs: SubmissionDoc[],
  viewerId?: string | null,
): Promise<EnrichedSubmission[]> {
  return Promise.all(docs.map((doc) => enrichSubmission(doc, viewerId)))
}

/** 提交前规范化业务字段（如报销明细汇总 totalAmount） */
export function normalizeSubmissionData(
  schemaCode: string | null | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...data }
  if (schemaCode === 'fin-expense-apply' || schemaCode === 'fin-purchase-apply') {
    const items = normalized.items
    if (Array.isArray(items)) {
      const total = items.reduce((sum, row) => {
        const amount = typeof row === 'object' && row !== null ? Number((row as Record<string, unknown>).amount) : 0
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
      normalized.totalAmount = total
    }
  }
  return normalized
}

/** 请假详情页 descriptions 组件用扁平视图 */
function formatAttachments(raw: unknown): string {
  if (!raw) return '—'
  if (Array.isArray(raw)) {
    if (raw.length === 0) return '—'
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'name' in item) {
          return String((item as { name?: string }).name ?? '')
        }
        return '附件'
      })
      .filter(Boolean)
      .join('、')
  }
  return String(raw)
}

const TRIP_TRANSPORT_LABELS: Record<string, string> = {
  flight: '飞机',
  train: '高铁',
  car: '汽车',
  other: '其他',
}

function formatCompanions(raw: unknown): string {
  if (!raw) return '—'
  if (Array.isArray(raw)) {
    if (raw.length === 0) return '—'
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          return String(o.displayName ?? o.name ?? o.label ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('、') || '—'
  }
  return String(raw)
}

export function toLeaveDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const leaveType = data.leaveType as string | undefined
  return {
    applicantName: enriched.submitterName ?? data.applicantName ?? '—',
    leaveType: leaveType ? (LEAVE_TYPE_LABELS[leaveType] ?? leaveType) : '—',
    startTime: data.startTime ?? '—',
    endTime: data.endTime ?? '—',
    days: data.days ?? '—',
    reason: data.reason ?? '—',
    deptName: enriched.deptName ?? data.deptName ?? '—',
    status: SUBMISSION_STATUS_LABELS[enriched.status] ?? enriched.status,
    flowStatus: enriched.flowStatusLabel ?? '—',
    currentTask: enriched.currentTaskName ?? '—',
    agentUser: data.agentUserName ?? data.agentUser ?? '—',
    attachments: formatAttachments(data.attachments),
    flowInstanceId: enriched.flowInstanceId,
    recordId: enriched.id,
    taskId: enriched.viewerTaskId,
  }
}

/** 出差详情页 descriptions 扁平视图 */
export function toOaTripDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const transport = data.transport as string | undefined
  return {
    applicantName: enriched.submitterName ?? data.applicantName ?? '—',
    title: data.title ?? '—',
    destination: data.destination ?? '—',
    startDate: data.startDate ?? '—',
    endDate: data.endDate ?? '—',
    transport: transport ? (TRIP_TRANSPORT_LABELS[transport] ?? transport) : '—',
    budgetAmount: data.budgetAmount ?? '—',
    reason: data.reason ?? '—',
    deptName: enriched.deptName ?? data.deptName ?? '—',
    status: SUBMISSION_STATUS_LABELS[enriched.status] ?? enriched.status,
    flowStatus: enriched.flowStatusLabel ?? '—',
    currentTask: enriched.currentTaskName ?? '—',
    companions: formatCompanions(data.companions),
    attachments: formatAttachments(data.attachments),
    flowInstanceId: enriched.flowInstanceId,
    recordId: enriched.id,
    taskId: enriched.viewerTaskId,
  }
}

const SEAL_TYPE_LABELS: Record<string, string> = {
  official: '公章',
  contract: '合同章',
  finance: '财务章',
}

const SECURITY_LEVEL_LABELS: Record<string, string> = {
  public: '公开',
  internal: '内部',
  secret: '秘密',
}

const URGENCY_LABELS: Record<string, string> = {
  normal: '普通',
  urgent: '加急',
  critical: '特急',
}

function submissionDetailBase(enriched: EnrichedSubmission): Record<string, unknown> {
  return {
    applicantName: enriched.submitterName ?? '—',
    status: SUBMISSION_STATUS_LABELS[enriched.status] ?? enriched.status,
    flowStatus: enriched.flowStatusLabel ?? '—',
    currentTask: enriched.currentTaskName ?? '—',
    flowInstanceId: enriched.flowInstanceId,
    recordId: enriched.id,
    taskId: enriched.viewerTaskId,
  }
}

export function toOaSealDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const sealType = data.sealType as string | undefined
  const urgency = data.urgency as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    sealType: sealType ? (SEAL_TYPE_LABELS[sealType] ?? sealType) : '—',
    documentName: data.documentName ?? '—',
    copies: data.copies ?? '—',
    useDate: data.useDate ?? '—',
    urgency: urgency === 'urgent' ? '紧急' : urgency === 'normal' ? '普通' : (urgency ?? '—'),
    reason: data.reason ?? '—',
    attachments: formatAttachments(data.attachments),
  }
}

export function toOaDocReceiveDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const level = data.securityLevel as string | undefined
  return {
    ...submissionDetailBase(enriched),
    registerNo: data.registerNo ?? '—',
    sourceOrg: data.sourceOrg ?? '—',
    docTitle: data.docTitle ?? '—',
    securityLevel: level ? (SECURITY_LEVEL_LABELS[level] ?? level) : '—',
    copies: data.copies ?? '—',
    receiveDate: data.receiveDate ?? '—',
    remark: data.remark ?? '—',
  }
}

export function toOaDocDraftDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const urgency = data.urgency as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    mainRecipients: data.mainRecipients ?? '—',
    ccRecipients: data.ccRecipients ?? '—',
    urgency: urgency ? (URGENCY_LABELS[urgency] ?? urgency) : '—',
    body: data.body ?? '—',
  }
}

const COMPENSATION_LABELS: Record<string, string> = {
  time_off: '调休',
  pay: '加班费',
}

export function toHrOvertimeDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const comp = data.compensationType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    overtimeDate: data.overtimeDate ?? '—',
    startTime: data.startTime ?? '—',
    endTime: data.endTime ?? '—',
    hours: data.hours ?? '—',
    compensationType: comp ? (COMPENSATION_LABELS[comp] ?? comp) : '—',
    reason: data.reason ?? '—',
  }
}

export function toFinExpenseDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const items = data.items
  let itemCount = 0
  let itemsSummary = '—'
  if (Array.isArray(items)) {
    itemCount = items.length
    itemsSummary = items
      .slice(0, 5)
      .map((row) => {
        if (typeof row !== 'object' || row === null) return String(row)
        const r = row as Record<string, unknown>
        return `${r.name ?? '项目'} ¥${r.amount ?? 0}`
      })
      .join('；') || '—'
    if (items.length > 5) itemsSummary += ` 等${items.length}行`
  }
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    expenseType: data.expenseType != null ? String(data.expenseType) : '—',
    totalAmount: data.totalAmount ?? '—',
    itemCount,
    itemsSummary,
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: '银行转账',
  check: '支票',
  cash: '现金',
}

export function toFinPurchaseDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const items = data.items
  let itemCount = 0
  let itemsSummary = '—'
  if (Array.isArray(items)) {
    itemCount = items.length
    itemsSummary = items
      .slice(0, 5)
      .map((row) => {
        if (typeof row !== 'object' || row === null) return String(row)
        const r = row as Record<string, unknown>
        const qty = r.qty ?? 1
        const price = r.unitPrice ?? 0
        return `${r.name ?? '物品'} ×${qty} ¥${price}`
      })
      .join('；') || '—'
    if (items.length > 5) itemsSummary += ` 等${items.length}行`
  }
  const urgency = data.urgency as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    totalAmount: data.totalAmount ?? '—',
    supplier: data.supplier ?? '—',
    urgency: urgency ? (URGENCY_LABELS[urgency] ?? urgency) : '—',
    itemCount,
    itemsSummary,
  }
}

export function toFinPaymentDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const method = data.paymentMethod as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    relatedDocNo: data.relatedDocNo ?? '—',
    payee: data.payee ?? '—',
    amount: data.amount ?? '—',
    paymentMethod: method ? (PAYMENT_METHOD_LABELS[method] ?? method) : '—',
    bankAccount: data.bankAccount ?? '—',
    remark: data.remark ?? '—',
  }
}

const YES_NO_LABELS: Record<string, string> = {
  yes: '需要',
  no: '不需要',
}

export function toHrOnboardDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const equip = data.needEquipment as string | undefined
  const account = data.needAccount as string | undefined
  return {
    ...submissionDetailBase(enriched),
    employeeName: data.employeeName ?? '—',
    position: data.position ?? '—',
    department: data.department ?? '—',
    onboardDate: data.onboardDate ?? '—',
    needEquipment: equip ? (YES_NO_LABELS[equip] ?? equip) : '—',
    needAccount: account ? (YES_NO_LABELS[account] ?? account) : '—',
    remark: data.remark ?? '—',
  }
}

const APPLICANT_TYPE_LABELS: Record<string, string> = {
  individual: '个人',
  enterprise: '企业',
}

const CASE_TYPE_LABELS: Record<string, string> = {
  license: '行政许可',
  service: '公共服务',
  complaint: '投诉建议',
}

export function toGovCaseDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const applicantType = data.applicantType as string | undefined
  const caseType = data.caseType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    applicantType: applicantType ? (APPLICANT_TYPE_LABELS[applicantType] ?? applicantType) : '—',
    partyName: data.applicantName ?? '—',
    idNumber: data.idNumber ?? '—',
    contact: data.contact ?? '—',
    caseType: caseType ? (CASE_TYPE_LABELS[caseType] ?? caseType) : '—',
    deadlineDays: data.deadlineDays ?? '—',
    remark: data.remark ?? '—',
  }
}

const RESIGN_TYPE_LABELS: Record<string, string> = {
  voluntary: '主动离职',
  mutual: '协商离职',
  dismissal: '辞退',
}

export function toHrResignDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const resignType = data.resignType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    employeeName: data.employeeName ?? '—',
    department: data.department ?? '—',
    resignDate: data.resignDate ?? '—',
    resignType: resignType ? (RESIGN_TYPE_LABELS[resignType] ?? resignType) : '—',
    handoverNote: data.handoverNote ?? '—',
    reason: data.reason ?? '—',
  }
}

const RECRUIT_URGENCY_LABELS: Record<string, string> = {
  normal: '普通',
  urgent: '紧急',
}

export function toHrRecruitDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const urgency = data.urgency as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    headcount: data.headcount ?? '—',
    urgency: urgency ? (RECRUIT_URGENCY_LABELS[urgency] ?? urgency) : '—',
    reason: data.reason ?? '—',
  }
}

const LICENSE_TYPE_LABELS: Record<string, string> = {
  business_license: '营业执照',
  operating_permit: '经营许可证',
  qualification: '资质证书',
  other: '其他证照',
}

export function toGovLicenseDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const licenseType = data.licenseType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    licenseType: licenseType ? (LICENSE_TYPE_LABELS[licenseType] ?? licenseType) : '—',
    holderName: data.holderName ?? '—',
    purpose: data.purpose ?? '—',
    validUntil: data.validUntil ?? '—',
    remark: data.remark ?? '—',
  }
}

export function toOaMeetingDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    room: data.room ?? '—',
    meetingDate: data.meetingDate ?? '—',
    startTime: data.startTime ?? '—',
    endTime: data.endTime ?? '—',
    attendeeCount: data.attendeeCount ?? '—',
    remark: data.remark ?? '—',
  }
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  office: '办公设备',
  it: 'IT 设备',
  furniture: '家具',
  other: '其他',
}

export function toOaAssetDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const assetType = data.assetType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    title: data.title ?? '—',
    assetName: data.assetName ?? '—',
    assetType: assetType ? (ASSET_TYPE_LABELS[assetType] ?? assetType) : '—',
    quantity: data.quantity ?? '—',
    useDate: data.useDate ?? '—',
    expectedReturnDate: data.expectedReturnDate ?? '—',
    reason: data.reason ?? '—',
  }
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  input: '进项',
  output: '销项',
}

export function toFinInvoiceDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  const invoiceType = data.invoiceType as string | undefined
  return {
    ...submissionDetailBase(enriched),
    invoiceNo: data.invoiceNo ?? '—',
    invoiceType: invoiceType ? (INVOICE_TYPE_LABELS[invoiceType] ?? invoiceType) : '—',
    amount: data.amount ?? '—',
    taxAmount: data.taxAmount ?? '—',
    issueDate: data.issueDate ?? '—',
    vendorName: data.vendorName ?? '—',
    relatedExpenseNo: data.relatedExpenseNo ?? '—',
  }
}

export function toFinBudgetDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  return {
    ...submissionDetailBase(enriched),
    budgetYear: data.budgetYear ?? '—',
    department: data.department ?? '—',
    subject: data.subject ?? '—',
    budgetAmount: data.budgetAmount ?? '—',
    description: data.description ?? '—',
  }
}

export function toEquipRequisitionDetailView(enriched: EnrichedSubmission): Record<string, unknown> {
  const data = enriched.data
  return {
    ...submissionDetailBase(enriched),
    equipmentName: data.equipmentName ?? '—',
    borrowerName: data.borrowerName ?? '—',
    department: data.department ?? '—',
    purpose: data.purpose ?? '—',
    expectedReturnDate: data.expectedReturnDate ?? '—',
    remark: data.remark ?? '—',
  }
}

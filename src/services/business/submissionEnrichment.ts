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

type SubmissionDoc = IFormSubmission & { _id: unknown; toJSON?: () => Record<string, unknown> }

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
    const user = await UserModel.findById(submitterId).select('displayName deptId').lean()
    if (user) {
      submitterName = user.displayName ?? null
      if (user.deptId) {
        const dept = await DeptModel.findById(user.deptId).select('name').lean()
        deptName = dept?.name ?? null
      }
    }
  }

  let flowStatus: string | null = null
  let flowStatusLabel: string | null = null
  let currentTaskName: string | null = null
  let viewerTaskId: string | null = null

  if (flowInstanceId) {
    const flow = await FlowInstanceModel.findById(flowInstanceId).select('status').lean()
    if (flow) {
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
    const task = await TaskInstanceModel.findOne(taskFilter)
      .sort({ createdAt: -1 })
      .select('nodeName _id assignee')
      .lean()
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
    agentUser: data.agentUser ?? data.agentUserName ?? '—',
    flowInstanceId: enriched.flowInstanceId,
    recordId: enriched.id,
    taskId: enriched.viewerTaskId,
  }
}

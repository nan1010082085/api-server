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
}

type SubmissionDoc = IFormSubmission & { _id: unknown; toJSON?: () => Record<string, unknown> }

function toPlainSubmission(doc: SubmissionDoc): Record<string, unknown> {
  if (typeof doc.toJSON === 'function') return doc.toJSON()
  return doc as unknown as Record<string, unknown>
}

export async function enrichSubmission(doc: SubmissionDoc): Promise<EnrichedSubmission> {
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

  if (flowInstanceId) {
    const flow = await FlowInstanceModel.findById(flowInstanceId).select('status').lean()
    if (flow) {
      flowStatus = flow.status
      flowStatusLabel = FLOW_STATUS_LABELS[flow.status] ?? flow.status
    }
    const task = await TaskInstanceModel.findOne({
      instanceId: flowInstanceId,
      status: { $in: ['pending', 'claimed'] },
    })
      .sort({ createdAt: -1 })
      .select('nodeName')
      .lean()
    currentTaskName = task?.nodeName ?? null
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
  }
}

export async function enrichSubmissions(docs: SubmissionDoc[]): Promise<EnrichedSubmission[]> {
  return Promise.all(docs.map((doc) => enrichSubmission(doc)))
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
  }
}

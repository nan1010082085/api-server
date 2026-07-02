/**
 * A-01 — 规则版审批建议（Phase 1）；后续可替换为 LLM 而不改接口。
 */
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { TaskInstanceModel } from '../flow-models/TaskInstance.js'

export interface ApprovalSuggestionInput {
  taskId?: string
  submissionId?: string
  formData?: Record<string, unknown>
  flowContext?: Record<string, unknown>
}

export interface ApprovalSuggestionResult {
  suggestion: string
  confidence: number
  reasoning: string
  recommendedAction: 'approve' | 'reject' | 'review'
}

function analyzeLeaveForm(data: Record<string, unknown>): ApprovalSuggestionResult {
  const days = Number(data.days ?? 0)
  const leaveType = String(data.leaveType ?? '')
  const reason = String(data.reason ?? '')

  if (days > 10) {
    return {
      suggestion: '建议重点审核：请假天数超过 10 天，请确认工作安排与审批权限。',
      confidence: 0.75,
      reasoning: `请假 ${days} 天，属于较长假期，需核实工作交接与部门人力安排。`,
      recommendedAction: 'review',
    }
  }

  if (leaveType === 'sick' && !data.attachments) {
    return {
      suggestion: '建议补充病假证明材料后再通过。',
      confidence: 0.8,
      reasoning: '病假类型通常需要附件佐证，当前表单未检测到附件字段。',
      recommendedAction: 'review',
    }
  }

  if (!reason.trim()) {
    return {
      suggestion: '建议驳回或要求补充事由说明。',
      confidence: 0.85,
      reasoning: '请假事由为空，不符合基本填报规范。',
      recommendedAction: 'reject',
    }
  }

  return {
    suggestion: '建议通过',
    confidence: 0.82,
    reasoning: `假别 ${leaveType || '未填'}、${days} 天，事由已填写，符合常规审批通过条件。`,
    recommendedAction: 'approve',
  }
}

export async function buildApprovalSuggestion(
  input: ApprovalSuggestionInput,
): Promise<ApprovalSuggestionResult> {
  let formData = input.formData ?? {}

  if (input.submissionId) {
    const submission = await FormSubmissionModel.findById(input.submissionId).lean()
    if (submission?.data) {
      formData = { ...formData, ...(submission.data as Record<string, unknown>) }
    }
  }

  if (input.taskId && Object.keys(formData).length === 0) {
    const task = await TaskInstanceModel.findById(input.taskId).lean()
    if (task?.formData) {
      formData = task.formData as Record<string, unknown>
    }
  }

  const leaveType = formData.leaveType ?? formData.leave_type
  if (leaveType !== undefined || formData.days !== undefined) {
    return analyzeLeaveForm(formData)
  }

  return {
    suggestion: '建议人工复核后决定',
    confidence: 0.6,
    reasoning: '暂无匹配的业务规则模板，请结合表单内容与流程节点信息判断。',
    recommendedAction: 'review',
  }
}

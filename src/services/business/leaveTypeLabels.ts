/** 请假假别 value → 展示 label（与 seed / deliverable 一致） */
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '年假',
  sick: '病假',
  personal: '事假',
  marriage: '婚假',
}

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted: '审批中',
  approved: '已通过',
  rejected: '已驳回',
}

export const FLOW_STATUS_LABELS: Record<string, string> = {
  running: '进行中',
  completed: '已完成',
  terminated: '已终止',
  suspended: '已挂起',
}

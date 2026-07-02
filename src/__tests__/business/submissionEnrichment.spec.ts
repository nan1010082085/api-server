import { describe, it, expect } from 'vitest'
import { toLeaveDetailView } from '../../services/business/submissionEnrichment.js'
import type { EnrichedSubmission } from '../../services/business/submissionEnrichment.js'

describe('toLeaveDetailView', () => {
  it('maps enriched submission to descriptions fields', () => {
    const enriched: EnrichedSubmission = {
      id: 'sub-1',
      schemaId: 'schema-1',
      data: {
        leaveType: 'annual',
        startTime: '2026-07-01 09:00',
        endTime: '2026-07-03 18:00',
        days: 3,
        reason: '年假',
        agentUser: '李四',
      },
      submitterId: 'user-1',
      status: 'submitted',
      flowInstanceId: 'flow-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      submitterName: '张三',
      deptName: '研发部',
      flowStatus: 'running',
      flowStatusLabel: '进行中',
      currentTaskName: '部门经理审批',
    }

    const view = toLeaveDetailView(enriched)
    expect(view.applicantName).toBe('张三')
    expect(view.leaveType).toBe('年假')
    expect(view.days).toBe(3)
    expect(view.status).toBe('审批中')
    expect(view.flowStatus).toBe('进行中')
    expect(view.currentTask).toBe('部门经理审批')
    expect(view.recordId).toBe('sub-1')
  })
})

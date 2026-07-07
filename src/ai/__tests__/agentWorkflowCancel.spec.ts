/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const executionFindOne = vi.fn()
const executionSave = vi.fn()

vi.mock('../models/agentWorkflow.js', () => ({
  AgentWorkflowModel: {},
  AgentWorkflowExecutionModel: {
    findOne: (...args: unknown[]) => executionFindOne(...args),
  },
}))

import { cancelAgentWorkflowExecution } from '../services/agentWorkflowService.js'

describe('cancelAgentWorkflowExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancels running execution and marks running nodes skipped', async () => {
    const startedAt = new Date('2026-07-06T02:00:00.000Z')
    const execution = {
      _id: 'exec-1',
      workflowId: 'wf-1',
      workflowName: 'WF',
      version: '20260706020000',
      status: 'running',
      trigger: 'manual',
      startedAt,
      nodeRecords: [
        {
          nodeId: 'llm-1',
          nodeType: 'llm',
          nodeName: 'LLM',
          status: 'running',
          startedAt,
        },
      ],
      markModified: vi.fn(),
      save: executionSave.mockResolvedValue(undefined),
      toObject: function (this: typeof execution) {
        return {
          _id: this._id,
          workflowId: this.workflowId,
          workflowName: this.workflowName,
          version: this.version,
          status: this.status,
          trigger: this.trigger,
          startedAt: this.startedAt,
          finishedAt: this.finishedAt,
          durationMs: this.durationMs,
          nodeRecords: this.nodeRecords,
          error: this.error,
          tenantId: '000000',
          versionId: null,
          triggeredBy: 'user1',
        }
      },
      toJSON: () => ({
        _id: 'exec-1',
        workflowId: 'wf-1',
        workflowName: 'WF',
        version: '20260706020000',
        status: 'cancelled',
        trigger: 'manual',
        startedAt,
        finishedAt: new Date('2026-07-06T02:00:05.000Z'),
        durationMs: 5000,
        nodeRecords: [
          {
            nodeId: 'llm-1',
            nodeType: 'llm',
            nodeName: 'LLM',
            status: 'skipped',
            startedAt,
            finishedAt: new Date('2026-07-06T02:00:05.000Z'),
            durationMs: 5000,
            error: '用户手动停止',
          },
        ],
        error: '用户手动停止',
      }),
    }

    executionFindOne.mockResolvedValue(execution)

    const result = await cancelAgentWorkflowExecution('exec-1', 'user1')
    expect(result?.status).toBe('cancelled')
    expect(execution.status).toBe('cancelled')
    expect(execution.nodeRecords[0].status).toBe('skipped')
    expect(executionSave).toHaveBeenCalled()
  })

  it('returns null when execution is not cancellable', async () => {
    executionFindOne.mockResolvedValue(null)
    const result = await cancelAgentWorkflowExecution('exec-1', 'user1')
    expect(result).toBeNull()
  })
})

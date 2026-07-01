/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/agentWorkflowExecutor.js', () => ({
  executeAgentWorkflow: (...args: unknown[]) => mockExecute(...args),
}))

const workflowFind = vi.fn()
const workflowFindOne = vi.fn()
const workflowCreate = vi.fn()
const workflowFindOneAndUpdate = vi.fn()
const workflowDeleteOne = vi.fn()
const executionFind = vi.fn()
const executionFindOne = vi.fn()
const executionCreate = vi.fn()
const executionCount = vi.fn()
const executionSelectFind = vi.fn()

vi.mock('../models/agentWorkflow.js', () => ({
  AgentWorkflowModel: {
    find: (...args: unknown[]) => workflowFind(...args),
    findOne: (...args: unknown[]) => workflowFindOne(...args),
    create: (...args: unknown[]) => workflowCreate(...args),
    findOneAndUpdate: (...args: unknown[]) => workflowFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => workflowDeleteOne(...args),
    findById: (...args: unknown[]) => workflowFindOne(...args),
  },
  AgentWorkflowExecutionModel: {
    find: (...args: unknown[]) => executionFind(...args),
    findOne: (...args: unknown[]) => executionFindOne(...args),
    create: (...args: unknown[]) => executionCreate(...args),
    countDocuments: (...args: unknown[]) => executionCount(...args),
    updateOne: vi.fn(),
  },
}))

import {
  listAgentWorkflows,
  getAgentWorkflow,
  listAgentWorkflowExecutions,
  createAgentWorkflow,
  publishAgentWorkflow,
} from '../services/agentWorkflowService.js'

describe('agentWorkflowService serializers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listAgentWorkflows maps lean _id to id and includes publishId/version', async () => {
    workflowFind.mockReturnValue({
      sort: () => ({
        lean: async () => [
          {
            _id: '507f1f77bcf86cd799439011',
            name: 'Demo',
            description: '',
            status: 'draft',
            version: '20260701090000',
            publishId: null,
            publishedVersion: null,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      }),
    })
    executionFind.mockReturnValue({
      select: () => ({ lean: async () => [] }),
    })

    const items = await listAgentWorkflows('user1')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('507f1f77bcf86cd799439011')
    expect(items[0].name).toBe('Demo')
    expect(items[0].version).toBe('20260701090000')
    expect(items[0].publishId).toBeNull()
    expect(items[0].hasRunningExecution).toBe(false)
  })

  it('getAgentWorkflow maps lean _id to id', async () => {
    workflowFindOne.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        name: 'Detail',
        description: '',
        status: 'draft',
        version: '20260701090000',
        publishId: null,
        publishedVersion: null,
        draftGraph: { entryNodeId: 'trigger-1', nodes: [], edges: [] },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    })
    executionCount.mockResolvedValue(0)

    const detail = await getAgentWorkflow('507f1f77bcf86cd799439012', 'user1')
    expect(detail?.id).toBe('507f1f77bcf86cd799439012')
    expect(detail?.draftGraph).toEqual({ entryNodeId: 'trigger-1', nodes: [], edges: [] })
    expect(detail?.version).toBe('20260701090000')
    expect(detail?.hasRunningExecution).toBe(false)
  })

  it('createAgentWorkflow returns summary with version timestamp', async () => {
    workflowCreate.mockImplementation((doc) => ({
      toJSON: () => ({
        _id: '507f1f77bcf86cd799439020',
        ...doc,
        updatedAt: new Date('2026-07-01T01:00:00.000Z'),
        createdAt: new Date('2026-07-01T01:00:00.000Z'),
      }),
    }))

    const summary = await createAgentWorkflow('user1', 'New WF')
    expect(summary.id).toBe('507f1f77bcf86cd799439020')
    expect(summary.name).toBe('New WF')
    expect(summary.version).toMatch(/^\d{14}$/)
  })

  it('publishAgentWorkflow reuses existing publishId and returns version string', async () => {
    const save = vi.fn()
    workflowFindOne.mockReturnValue({
      _id: '507f1f77bcf86cd799439012',
      name: 'Detail',
      status: 'draft',
      version: '20260701090000',
      publishId: 'existing-uuid',
      draftGraph: { entryNodeId: 't1', nodes: [], edges: [] },
      save,
    })

    const result = await publishAgentWorkflow('507f1f77bcf86cd799439012', 'user1')
    expect(result).not.toBeNull()
    expect(result?.publishId).toBe('existing-uuid')
    expect(result?.version).toBe('20260701090000')
    expect(save).toHaveBeenCalled()
  })

  it('listAgentWorkflowExecutions maps lean _id to id with string version', async () => {
    executionFind.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: '507f1f77bcf86cd799439013',
                workflowId: '507f1f77bcf86cd799439011',
                workflowName: 'Demo',
                versionId: null,
                version: '20260701090000',
                status: 'success',
                trigger: 'manual',
                startedAt: new Date('2026-01-01T00:00:00.000Z'),
                nodeRecords: [],
              },
            ],
          }),
        }),
      }),
    })
    executionCount.mockResolvedValue(1)

    const result = await listAgentWorkflowExecutions('user1')
    expect(result.items[0].id).toBe('507f1f77bcf86cd799439013')
    expect(result.items[0].versionId).toBeNull()
    expect(result.items[0].version).toBe('20260701090000')
  })
})

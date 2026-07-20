/**
 * Agent workflow createdBy isolation (A2.4.1 / A2.5)
 *
 * Intentional design:
 * - Workflow CRUD / publish / rotate-key / execute are strictly filtered by
 *   `createdBy === current user`. There is NO admin data_scope bypass for
 *   agent workflows (unlike /api/keys which allows data_scope=all).
 * - Executions are scoped by `triggeredBy === current user`.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/agentWorkflowExecutor.js', () => ({
  executeAgentWorkflow: (...args: unknown[]) => mockExecute(...args),
}))

const workflowFind = vi.fn()
const workflowFindOne = vi.fn()
const workflowFindOneAndUpdate = vi.fn()
const workflowDeleteOne = vi.fn()
const executionFind = vi.fn()
const executionFindOne = vi.fn()
const executionCount = vi.fn()

vi.mock('../models/agentWorkflow.js', () => ({
  AgentWorkflowModel: {
    find: (...args: unknown[]) => workflowFind(...args),
    findOne: (...args: unknown[]) => workflowFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => workflowFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => workflowDeleteOne(...args),
    findById: (...args: unknown[]) => workflowFindOne(...args),
    create: vi.fn(),
  },
  AgentWorkflowExecutionModel: {
    find: (...args: unknown[]) => executionFind(...args),
    findOne: (...args: unknown[]) => executionFindOne(...args),
    countDocuments: (...args: unknown[]) => executionCount(...args),
    create: vi.fn(),
  },
}))

import {
  listAgentWorkflows,
  getAgentWorkflow,
  updateAgentWorkflow,
  deleteAgentWorkflow,
  publishAgentWorkflow,
  startAgentWorkflowExecution,
  listAgentWorkflowExecutions,
  getAgentWorkflowExecution,
} from '../services/agentWorkflowService.js'

describe('agentWorkflow createdBy isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listAgentWorkflows queries only createdBy current user', async () => {
    workflowFind.mockReturnValue({
      sort: () => ({ lean: async () => [] }),
    })
    executionFind.mockReturnValue({
      select: () => ({ lean: async () => [] }),
    })

    await listAgentWorkflows('user-a')
    expect(workflowFind).toHaveBeenCalledWith({ createdBy: 'user-a' })
  })

  it('getAgentWorkflow returns null for other user ownership filter miss', async () => {
    workflowFindOne.mockReturnValue({
      select: () => ({ lean: async () => null }),
    })

    const result = await getAgentWorkflow('507f1f77bcf86cd799439011', 'user-b')
    expect(result).toBeNull()
    expect(workflowFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      createdBy: 'user-b',
    })
  })

  it('updateAgentWorkflow requires createdBy match', async () => {
    workflowFindOne.mockReturnValue({ lean: async () => null })

    const result = await updateAgentWorkflow('507f1f77bcf86cd799439011', 'intruder', {
      name: 'stolen',
    })
    expect(result).toBeNull()
    expect(workflowFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      createdBy: 'intruder',
    })
  })

  it('deleteAgentWorkflow deletes only owned workflow', async () => {
    executionCount.mockResolvedValue(0)
    workflowDeleteOne.mockResolvedValue({ deletedCount: 0 })

    const ok = await deleteAgentWorkflow('507f1f77bcf86cd799439011', 'user-x')
    expect(ok).toBe(false)
    expect(workflowDeleteOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      createdBy: 'user-x',
    })
  })

  it('publishAgentWorkflow looks up by createdBy', async () => {
    workflowFindOne.mockResolvedValue(null)
    const result = await publishAgentWorkflow('507f1f77bcf86cd799439011', 'user-y')
    expect(result).toBeNull()
    expect(workflowFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      createdBy: 'user-y',
    })
  })

  it('startAgentWorkflowExecution refuses cross-user workflow', async () => {
    workflowFindOne.mockResolvedValue(null)
    const result = await startAgentWorkflowExecution(
      '507f1f77bcf86cd799439011',
      'user-z',
      {},
    )
    expect(result).toBeNull()
    expect(workflowFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      createdBy: 'user-z',
    })
  })

  it('listAgentWorkflowExecutions filters by triggeredBy', async () => {
    executionFind.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => [],
          }),
        }),
      }),
    })
    executionCount.mockResolvedValue(0)

    await listAgentWorkflowExecutions('user-exec', { workflowId: '507f1f77bcf86cd799439011' })
    expect(executionFind).toHaveBeenCalledWith({
      triggeredBy: 'user-exec',
      workflowId: expect.anything(),
    })
  })

  it('getAgentWorkflowExecution filters by triggeredBy', async () => {
    executionFindOne.mockReturnValue({ lean: async () => null })
    const result = await getAgentWorkflowExecution('507f1f77bcf86cd799439099', 'user-exec')
    expect(result).toBeNull()
    expect(executionFindOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439099',
      triggeredBy: 'user-exec',
    })
  })
})

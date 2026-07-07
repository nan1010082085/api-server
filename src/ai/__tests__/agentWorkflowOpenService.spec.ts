/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/agentWorkflowExecutor.js', () => ({
  executeAgentWorkflow: (...args: unknown[]) => mockExecute(...args),
}))

const workflowFindOne = vi.fn()
const executionCreate = vi.fn()
const getExecution = vi.fn()
const resumeExecution = vi.fn()
const cancelExecution = vi.fn()

vi.mock('../models/agentWorkflow.js', () => ({
  AgentWorkflowModel: {
    findOne: (...args: unknown[]) => workflowFindOne(...args),
  },
  AgentWorkflowExecutionModel: {
    create: (...args: unknown[]) => executionCreate(...args),
  },
}))

vi.mock('../services/agentWorkflowService.js', () => ({
  getAgentWorkflowExecution: (...args: unknown[]) => getExecution(...args),
  resumeAgentWorkflowExecution: (...args: unknown[]) => resumeExecution(...args),
  cancelAgentWorkflowExecution: (...args: unknown[]) => cancelExecution(...args),
  toExecution: (doc: Record<string, unknown>) => ({
    id: String(doc._id ?? doc.id),
    workflowId: String(doc.workflowId),
    workflowName: doc.workflowName,
    versionId: doc.versionId ?? null,
    version: doc.version ?? '',
    status: doc.status,
    trigger: doc.trigger,
    startedAt: new Date(doc.startedAt as string).toISOString(),
    nodeRecords: [],
  }),
}))

import {
  assertWorkflowExecutePermission,
  startOpenWorkflowExecution,
  OpenWorkflowError,
} from '../services/agentWorkflowOpenService.js'

const auth = {
  tenantId: '000000',
  userId: 'user-open',
  source: 'apiKey' as const,
  keyId: 'key1',
  permissions: ['workflow:execute'],
}

describe('agentWorkflowOpenService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('assertWorkflowExecutePermission rejects missing permission', () => {
    expect(() =>
      assertWorkflowExecutePermission({ ...auth, permissions: ['schema:view'] }),
    ).toThrow(OpenWorkflowError)
  })

  it('startOpenWorkflowExecution creates api-triggered execution for published workflow', async () => {
    workflowFindOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      name: 'Doc Parse',
      tenantId: '000000',
      status: 'published',
      slug: 'doc-parse',
      publishId: 'pub-1',
      publishedVersion: '20260707090000',
      publishedGraph: { entryNodeId: 'trigger-1', nodes: [], edges: [] },
      version: '20260707090000',
      versions: [],
      toObject() {
        return {
          _id: '507f1f77bcf86cd799439011',
          name: 'Doc Parse',
          tenantId: '000000',
          status: 'published',
          slug: 'doc-parse',
          publishId: 'pub-1',
          publishedVersion: '20260707090000',
          publishedGraph: { entryNodeId: 'trigger-1', nodes: [], edges: [] },
          version: '20260707090000',
          versions: [],
        }
      },
    })
    executionCreate.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      workflowId: '507f1f77bcf86cd799439011',
      workflowName: 'Doc Parse',
      versionId: 'pub-1',
      version: '20260707090000',
      status: 'running',
      trigger: 'api',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      toJSON() {
        return {
          _id: '507f1f77bcf86cd799439099',
          workflowId: '507f1f77bcf86cd799439011',
          workflowName: 'Doc Parse',
          versionId: 'pub-1',
          version: '20260707090000',
          status: 'running',
          trigger: 'api',
          startedAt: new Date('2026-07-07T00:00:00.000Z'),
        }
      },
    })

    const result = await startOpenWorkflowExecution(auth, {
      slug: 'doc-parse',
      input: { message: 'hello' },
    })

    expect(result?.id).toBe('507f1f77bcf86cd799439099')
    expect(result?.trigger).toBe('api')
    expect(mockExecute).toHaveBeenCalledOnce()
    expect(workflowFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: '000000', slug: 'doc-parse', status: 'published' }),
    )
  })

  it('startOpenWorkflowExecution returns null when workflow missing', async () => {
    workflowFindOne.mockResolvedValue(null)
    const result = await startOpenWorkflowExecution(auth, { workflowId: '507f1f77bcf86cd799439011' })
    expect(result).toBeNull()
  })
})

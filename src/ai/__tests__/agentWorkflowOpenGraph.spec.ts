/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { resolveWorkflowGraphForOpen } from '../services/agentWorkflowOpenGraph.js'

describe('agentWorkflowOpenGraph', () => {
  const base = {
    tenantId: '000000',
    name: 'Demo',
    description: '',
    status: 'published' as const,
    draftGraph: { entryNodeId: 't1', nodes: [], edges: [] },
    version: '20260707090000',
    versions: [],
    publishId: 'pub-1',
    publishedVersion: '20260707090000',
    publishedGraph: { entryNodeId: 'pub', nodes: [{ id: 'pub' }], edges: [] },
    createdBy: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('returns latest published graph by default', () => {
    const resolved = resolveWorkflowGraphForOpen(base)
    expect(resolved?.version).toBe('20260707090000')
    expect(resolved?.graph).toEqual(base.publishedGraph)
  })

  it('returns snapshot graph for requested version', () => {
    const resolved = resolveWorkflowGraphForOpen({
      ...base,
      versions: [{ version: '20260701090000', graph: { entryNodeId: 'old', nodes: [], edges: [] }, createdAt: new Date() }],
    }, '20260701090000')
    expect(resolved?.graph).toEqual({ entryNodeId: 'old', nodes: [], edges: [] })
  })
})

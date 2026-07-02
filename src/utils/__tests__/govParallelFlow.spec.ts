import { describe, expect, it } from 'vitest'
import { BUILTIN_FLOW_TEMPLATE_SPECS, GOV_PARALLEL_FLOW_NAME } from '../builtinFlowGraphs.js'

describe('F-02 gov parallel flow seed', () => {
  it('政务并联审批 contains parallel multi-instance sign node', () => {
    const gov = BUILTIN_FLOW_TEMPLATE_SPECS.find((g) => g.name === GOV_PARALLEL_FLOW_NAME)
    expect(gov).toBeDefined()

    const parallel = gov!.graph.nodes.find((n) => n.id === 'parallel-sign')
    expect(parallel?.data.multiInstanceType).toBe('parallel')
    expect(parallel?.data.approvalMode).toBe('multi')
    expect(parallel?.data.candidateRoles).toEqual(
      expect.arrayContaining(['department_manager', 'hr', 'finance']),
    )
  })
})

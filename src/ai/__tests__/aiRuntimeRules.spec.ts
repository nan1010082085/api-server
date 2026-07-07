import { describe, it, expect } from 'vitest'
import {
  evaluateSimpleCondition,
  predictApprovalOutcome,
  scoreAssigneeCandidates,
} from '../../services/aiRuntimeRules.js'

describe('aiRuntimeRules', () => {
  it('evaluates simple boolean expressions', () => {
    expect(evaluateSimpleCondition('amount > 100', { amount: 200 })).toBe(true)
    expect(evaluateSimpleCondition('amount > 100', { amount: 50 })).toBe(false)
  })

  it('scores assignee candidates', () => {
    const ranked = scoreAssigneeCandidates(['u1', 'u2'], { workload: { u1: 5, u2: 1 } })
    expect(ranked[0]?.userId).toBe('u2')
  })

  it('predicts outcome with risk factors for large amounts', () => {
    const result = predictApprovalOutcome({ amount: 200000 })
    expect(result.passProbability).toBeLessThan(75)
    expect(result.riskFactors.length).toBeGreaterThan(0)
  })
})

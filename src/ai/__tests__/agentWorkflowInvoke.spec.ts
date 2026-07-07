import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateInvokeKey,
  maskInvokeKey,
  verifyWorkflowInvokeKey,
} from '../services/agentWorkflowInvoke.js'

describe('agentWorkflowInvoke', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('generateInvokeKey returns wf_ prefix hex', () => {
    const key = generateInvokeKey()
    expect(key.startsWith('wf_')).toBe(true)
    expect(key.length).toBeGreaterThan(20)
  })

  it('maskInvokeKey hides middle segment', () => {
    const masked = maskInvokeKey('wf_abcdef1234567890abcdef12')
    expect(masked).toContain('****')
    expect(masked.startsWith('wf_abcde')).toBe(true)
  })

  it('verifyWorkflowInvokeKey uses timing-safe compare', () => {
    const key = generateInvokeKey()
    expect(verifyWorkflowInvokeKey(key, key)).toBe(true)
    expect(verifyWorkflowInvokeKey(key, `${key}x`)).toBe(false)
    expect(verifyWorkflowInvokeKey(undefined, key)).toBe(false)
  })
})

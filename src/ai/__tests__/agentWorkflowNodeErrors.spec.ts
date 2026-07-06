/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { extractNodeOutputError } from '../services/agentWorkflowNodeErrors.js'

describe('agentWorkflowNodeErrors', () => {
  it('detects error field in object output', () => {
    expect(extractNodeOutputError({ error: '未指定文档 ID' })).toBe('未指定文档 ID')
  })

  it('detects success=false tool results', () => {
    expect(extractNodeOutputError({ success: false, error: 'rag failed' })).toBe('rag failed')
  })

  it('detects HTTP status errors', () => {
    expect(extractNodeOutputError({ status: 404, data: 'not found' })).toBe('not found')
  })

  it('detects string status code errors from tools', () => {
    expect(extractNodeOutputError('404 status code (no body)')).toBe('404 status code (no body)')
  })

  it('returns null for successful outputs', () => {
    expect(extractNodeOutputError({ text: 'hello' })).toBeNull()
    expect(extractNodeOutputError({ status: 200, data: { ok: true } })).toBeNull()
  })
})

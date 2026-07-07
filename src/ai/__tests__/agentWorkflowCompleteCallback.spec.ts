/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  signCompleteCallbackPayload,
  buildCompleteCallbackPayload,
  resolveCompleteCallback,
  dispatchWorkflowCompleteCallback,
} from '../services/agentWorkflowCompleteCallback.js'

describe('agentWorkflowCompleteCallback', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signCompleteCallbackPayload matches webhook format', () => {
    const sig = signCompleteCallbackPayload('secret', '{"a":1}')
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/)
  })

  it('resolveCompleteCallback prefers request override', () => {
    const resolved = resolveCompleteCallback(
      { onCompleteWebhook: { url: 'https://wf.example/hook', secret: 'wf-secret' } },
      { callbackUrl: 'https://run.example/cb', callbackSecret: 'run-secret' },
    )
    expect(resolved.url).toBe('https://run.example/cb')
    expect(resolved.secret).toBe('run-secret')
  })

  it('dispatchWorkflowCompleteCallback POSTs payload with signature', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    await dispatchWorkflowCompleteCallback({
      _id: '507f1f77bcf86cd799439099',
      workflowId: '507f1f77bcf86cd799439011' as unknown as import('mongoose').Types.ObjectId,
      workflowName: 'Demo',
      tenantId: '000000',
      versionId: null,
      version: '20260707090000',
      status: 'success',
      trigger: 'api',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      finishedAt: new Date('2026-07-07T00:00:05.000Z'),
      durationMs: 5000,
      nodeRecords: [],
      triggeredBy: 'user1',
      completeCallbackUrl: 'https://example.com/callback',
      completeCallbackSecret: 'top-secret',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Webhook-Signature']).toMatch(/^sha256=/)
    const payload = buildCompleteCallbackPayload({
      _id: '507f1f77bcf86cd799439099',
      workflowId: '507f1f77bcf86cd799439011' as unknown as import('mongoose').Types.ObjectId,
      workflowName: 'Demo',
      tenantId: '000000',
      versionId: null,
      version: '20260707090000',
      status: 'success',
      trigger: 'api',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      finishedAt: new Date('2026-07-07T00:00:05.000Z'),
      durationMs: 5000,
      nodeRecords: [],
      triggeredBy: 'user1',
      completeCallbackUrl: 'https://example.com/callback',
    })
    expect(payload.executionId).toBe('507f1f77bcf86cd799439099')
    expect(payload.status).toBe('success')
  })
})

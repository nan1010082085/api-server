/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeHttpRequest } from '../tools/httpToolExecutor.js'

function mockFetchResponse(opts: { ok: boolean; status: number; body: string }) {
  const bytes = new TextEncoder().encode(opts.body)
  return {
    ok: opts.ok,
    status: opts.status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
  }
}

/** 单测禁用 SSRF DNS，避免依赖外网解析 */
const TEST_CONFIG = { ssrfProtection: false } as const

describe('httpToolExecutor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockFetchResponse({ ok: true, status: 200, body: JSON.stringify({ ok: true }) })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('executeHttpRequest returns parsed JSON on success', async () => {
    const result = await executeHttpRequest(
      { url: 'https://example.com/api', method: 'GET' },
      TEST_CONFIG,
    )
    expect(result.error).toBeUndefined()
    expect(result.output.status).toBe(200)
    expect(result.output.data).toEqual({ ok: true })
  })

  it('executeHttpRequest requires url', async () => {
    const result = await executeHttpRequest({ method: 'GET' }, TEST_CONFIG)
    expect(result.error).toBe('url is required')
  })

  it('executeHttpRequest surfaces HTTP error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => mockFetchResponse({ ok: false, status: 404, body: 'not found' })),
    )
    const result = await executeHttpRequest(
      { url: 'https://example.com/missing' },
      TEST_CONFIG,
    )
    expect(result.error).toBe('not found')
    expect(result.output.status).toBe(404)
  })
})

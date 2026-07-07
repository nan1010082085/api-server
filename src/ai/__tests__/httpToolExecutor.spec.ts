/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeHttpRequest } from '../tools/httpToolExecutor.js'

describe('httpToolExecutor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('executeHttpRequest returns parsed JSON on success', async () => {
    const result = await executeHttpRequest({ url: 'https://example.com/api', method: 'GET' })
    expect(result.error).toBeUndefined()
    expect(result.output.status).toBe(200)
    expect(result.output.data).toEqual({ ok: true })
  })

  it('executeHttpRequest requires url', async () => {
    const result = await executeHttpRequest({ method: 'GET' })
    expect(result.error).toBe('url is required')
  })

  it('executeHttpRequest surfaces HTTP error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => 'not found',
      })),
    )
    const result = await executeHttpRequest({ url: 'https://example.com/missing' })
    expect(result.error).toBe('not found')
    expect(result.output.status).toBe(404)
  })
})

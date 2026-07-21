/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'
import { validate } from '../middleware/validate.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { z } from 'zod'
import type { Context, Next } from 'koa'

function mockCtx(partial: Partial<Context> & { request?: { body?: unknown }; query?: unknown }): Context {
  return {
    status: 200,
    body: undefined,
    request: { body: partial.request?.body },
    query: partial.query ?? {},
    method: 'POST',
    url: '/test',
    ip: '127.0.0.1',
    get: () => '',
    app: { emit: vi.fn() },
    ...partial,
  } as unknown as Context
}

describe('validate middleware', () => {
  it('returns VALIDATION_ERROR with details', async () => {
    const mw = validate(z.object({ name: z.string().min(1) }))
    const ctx = mockCtx({ request: { body: {} } })
    const next = vi.fn()
    await mw(ctx, next as Next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(400)
    expect(ctx.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed' },
    })
    expect((ctx.body as { error: { details: unknown[] } }).error.details.length).toBeGreaterThan(0)
  })
})

describe('errorHandler', () => {
  it('maps 404 to NOT_FOUND code without error.status', async () => {
    const ctx = mockCtx({})
    const err = Object.assign(new Error('missing'), { status: 404, expose: true })
    await errorHandler(ctx, (async () => { throw err }) as Next)
    expect(ctx.status).toBe(404)
    expect(ctx.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'missing' },
    })
  })

  it('prefers err.code when provided', async () => {
    const ctx = mockCtx({})
    const err = Object.assign(new Error('boom'), { status: 400, expose: true, code: 'CUSTOM_CODE' })
    await errorHandler(ctx, (async () => { throw err }) as Next)
    expect(ctx.body).toEqual({
      success: false,
      error: { code: 'CUSTOM_CODE', message: 'boom' },
    })
  })
})

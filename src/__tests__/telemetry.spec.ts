/**
 * Telemetry API tests (A2.1)
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: () => async (ctx: { state: Record<string, unknown> }, next: () => Promise<void>) => {
    ctx.state.user = {
      id: 'user-telemetry-1',
      username: 'telemetry',
      roles: ['user'],
      tenantId: 'tenant-tel-1',
      deptId: null,
      tokenType: 'access',
    }
    await next()
  },
}))

const insertMany = vi.fn().mockResolvedValue([])
const createError = vi.fn().mockResolvedValue({ _id: 'err-1' })
const aggregate = vi.fn().mockResolvedValue([
  { _id: 'ai.chat.send', count: 3 },
  { _id: 'ai.plugin.enable', count: 1 },
])
const countDocuments = vi.fn().mockResolvedValue(2)

vi.mock('../models/TelemetryEvent.js', () => ({
  TelemetryEventModel: {
    insertMany: (...args: unknown[]) => insertMany(...args),
    aggregate: (...args: unknown[]) => aggregate(...args),
  },
}))

vi.mock('../models/TelemetryError.js', () => ({
  TelemetryErrorModel: {
    create: (...args: unknown[]) => createError(...args),
    countDocuments: (...args: unknown[]) => countDocuments(...args),
  },
}))

import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'node:http'
import telemetryRouter from '../routes/telemetry.js'

let server: http.Server | null = null
let baseUrl = ''

async function request(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(`${baseUrl}${path}`, init)
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text }
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  insertMany.mockResolvedValue([])
  createError.mockResolvedValue({ _id: 'err-1' })
  aggregate.mockResolvedValue([
    { _id: 'ai.chat.send', count: 3 },
    { _id: 'ai.plugin.enable', count: 1 },
  ])
  countDocuments.mockResolvedValue(2)

  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }

  const app = new Koa()
  app.use(bodyParser())
  app.use(telemetryRouter.routes())
  app.use(telemetryRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as { port: number }
      baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }
})

describe('POST /api/telemetry/events', () => {
  it('accepts a batch and persists with tenant/user', async () => {
    const res = await request('POST', '/api/telemetry/events', {
      events: [
        { name: 'ai.chat.send', properties: { threadId: 't1' }, timestamp: 1 },
        { name: 'ai.plugin.enable' },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accepted).toBe(2)
    expect(insertMany).toHaveBeenCalledOnce()
    const docs = insertMany.mock.calls[0]![0] as Array<Record<string, unknown>>
    expect(docs[0]).toMatchObject({
      tenantId: 'tenant-tel-1',
      userId: 'user-telemetry-1',
      name: 'ai.chat.send',
    })
  })

  it('rejects empty batch', async () => {
    const res = await request('POST', '/api/telemetry/events', { events: [] })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(insertMany).not.toHaveBeenCalled()
  })

  it('rejects batch larger than 100', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({ name: `e.${i}` }))
    const res = await request('POST', '/api/telemetry/events', { events })
    expect(res.status).toBe(400)
    expect(insertMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/telemetry/errors', () => {
  it('persists error report', async () => {
    const res = await request('POST', '/api/telemetry/errors', {
      message: 'boom',
      stack: 'Error: boom',
      context: { source: 'test' },
      timestamp: 99,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('err-1')
    expect(createError).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-tel-1',
        userId: 'user-telemetry-1',
        message: 'boom',
      }),
    )
  })

  it('rejects missing message', async () => {
    const res = await request('POST', '/api/telemetry/errors', { stack: 'x' })
    expect(res.status).toBe(400)
    expect(createError).not.toHaveBeenCalled()
  })
})

describe('GET /api/telemetry/funnel', () => {
  it('returns funnel counts for known event names', async () => {
    const res = await request('GET', '/api/telemetry/funnel?hours=24')
    expect(res.status).toBe(200)
    expect(res.body.data.hours).toBe(24)
    expect(res.body.data.funnel['ai.chat.send']).toBe(3)
    expect(res.body.data.funnel['ai.plugin.enable']).toBe(1)
    expect(res.body.data.funnel['ai.workflow.publish']).toBe(0)
    expect(res.body.data.errorCount).toBe(2)
    expect(res.body.data.totalFunnelEvents).toBe(4)
  })
})

describe('GET /api/telemetry/summary', () => {
  it('aliases funnel', async () => {
    const res = await request('GET', '/api/telemetry/summary')
    expect(res.status).toBe(200)
    expect(res.body.data.funnel['ai.chat.send']).toBe(3)
  })
})

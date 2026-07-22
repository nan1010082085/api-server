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

/**
 * 智能 aggregate mock：按 pipeline 形态返回不同结果
 * - $group._id === '$name' -> 事件名汇总（funnel / editor totals）
 * - $group._id.date 存在（$dateToString） -> 按天 timeseries
 * - $group._id === '$properties.schemaId' -> top schemas
 * - $group._id === '$userId' -> 活跃用户去重
 */
const aggregate = vi.fn((pipeline: unknown[]) => {
  const stages = pipeline as Array<Record<string, unknown>>
  const groupStage = stages.find((s) => s.$group) as { $group: { _id: unknown } } | undefined
  const id = groupStage?.$group?._id
  // daily: _id 是对象且含 date 字段
  if (id && typeof id === 'object' && 'date' in (id as Record<string, unknown>)) {
    return Promise.resolve([
      { _id: { date: '2026-07-20', name: 'save' }, count: 5 },
      { _id: { date: '2026-07-20', name: 'publish' }, count: 2 },
      { _id: { date: '2026-07-21', name: 'save' }, count: 8 },
    ])
  }
  if (id === '$properties.schemaId') {
    return Promise.resolve([
      { _id: 'schema-1', count: 12 },
      { _id: 'schema-2', count: 4 },
    ])
  }
  if (id === '$userId') {
    return Promise.resolve([{ _id: 'u1' }, { _id: 'u2' }, { _id: 'u3' }])
  }
  // 默认：事件名汇总（funnel）
  return Promise.resolve([
    { _id: 'ai.chat.send', count: 3 },
    { _id: 'ai.plugin.enable', count: 1 },
  ])
})
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
  // aggregate 保留智能实现（按 pipeline 形态分流），clearAllMocks 不会重置实现
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

describe('GET /api/telemetry/editor-summary', () => {
  it('aggregates editor events by name / day / schema / active users', async () => {
    const res = await request('GET', '/api/telemetry/editor-summary?hours=168')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const data = res.body.data
    expect(data.hours).toBe(168)
    // totals 含全部 editor 事件名（未命中的为 0）
    expect(data.totals).toHaveProperty('save')
    expect(data.totals).toHaveProperty('publish')
    expect(data.totals).toHaveProperty('undo')
    expect(Object.keys(data.totals).sort()).toEqual(
      [
        'save', 'publish', 'unpublish', 'delete',
        'undo', 'redo', 'create', 'copy', 'import', 'export',
      ].sort(),
    )
    // daily timeseries
    expect(Array.isArray(data.daily)).toBe(true)
    expect(data.daily.length).toBeGreaterThan(0)
    expect(data.daily[0]).toHaveProperty('date')
    expect(data.daily[0]).toHaveProperty('counts')
    // topSchemas
    expect(data.topSchemas[0]).toEqual({ schemaId: 'schema-1', count: 12 })
    // activeUsers（mock 返回 3 个唯一 userId）
    expect(data.activeUsers).toBe(3)
    // totalEvents
    expect(typeof data.totalEvents).toBe('number')
  })

  it('defaults hours to 168 when omitted', async () => {
    const res = await request('GET', '/api/telemetry/editor-summary')
    expect(res.status).toBe(200)
    expect(res.body.data.hours).toBe(168)
  })

  it('gracefully defaults invalid hours to 168', async () => {
    const res = await request('GET', '/api/telemetry/editor-summary?hours=abc')
    expect(res.status).toBe(200)
    expect(res.body.data.hours).toBe(168)
  })
})

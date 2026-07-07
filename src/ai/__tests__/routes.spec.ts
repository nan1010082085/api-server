/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: () => async (ctx: { state: Record<string, unknown> }, next: () => Promise<void>) => {
    ctx.state.user = {
      id: 'dev-user-1',
      username: 'admin',
      roles: ['admin'],
      tenantId: '000000',
      deptId: null,
      tokenType: 'access',
    }
    await next()
  },
}))

import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'node:http'
import aiRouter from '../routes.js'

let server: http.Server | null = null
let baseUrl = ''

async function request(method: string, path: string, body?: unknown) {
  const url = `${baseUrl}${path}`
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) init.body = JSON.stringify(body)

  const res = await fetch(url, init)
  const text = await res.text()

  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text }
  }
}

beforeEach(async () => {
  vi.clearAllMocks()

  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }

  const app = new Koa()
  app.use(bodyParser())
  app.use(aiRouter.routes())
  app.use(aiRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as { port: number }
      baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

describe('Chat HTTP SSE endpoints removed', () => {
  it('POST /api/ai/chat returns 404', async () => {
    const res = await request('POST', '/api/ai/chat', {
      message: 'hello',
      context: { source: 'standalone' },
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/ai/chat/resume returns 404', async () => {
    const res = await request('POST', '/api/ai/chat/resume', {
      threadId: 'thread-1',
      confirmed: true,
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/ai/chat/interrupt/:threadId', () => {
  it('returns hasInterrupt false when no interrupted thread', async () => {
    const res = await request('GET', '/api/ai/chat/interrupt/unknown-thread')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      data: { hasInterrupt: false },
    })
  })
})

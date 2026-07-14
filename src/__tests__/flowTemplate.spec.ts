/**
 * Flow Template API Tests
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import { errorHandler } from '../middleware/errorHandler.js'

// ── Mock Mongoose models ──

const {
  mockFindChain,
  mockCountDocuments,
  mockCreate,
  mockFindById,
  mockFindOne,
  mockFindByIdAndUpdate,
  mockFindByIdAndDelete,
  mockUpdateOne,
} = vi.hoisted(() => ({
  mockFindChain: vi.fn(),
  mockCountDocuments: vi.fn(),
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindOne: vi.fn(),
  mockFindByIdAndUpdate: vi.fn(),
  mockFindByIdAndDelete: vi.fn(),
  mockUpdateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
}))

vi.mock('../flow-models/FlowTemplate.js', () => ({
  FlowTemplateModel: {
    find: mockFindChain,
    countDocuments: mockCountDocuments,
    create: mockCreate,
    findById: mockFindById,
    findOne: mockFindOne,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    findByIdAndDelete: mockFindByIdAndDelete,
    updateOne: mockUpdateOne,
  },
}))

vi.mock('../flow-models/FlowDefinition.js', () => ({
  FlowDefinitionModel: { create: vi.fn() },
}))

vi.mock('../flow-models/FlowVersion.js', () => ({
  FlowVersionModel: { create: vi.fn() },
}))

// Mock auth middleware to bypass DB-dependent dev user resolution
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: () => async (ctx: any, next: () => Promise<void>) => {
    ctx.state.user = { id: 'test-user', username: 'admin', roles: [], tenantId: '000000', tokenType: 'access' }
    await next()
  },
}))

import flowTemplateRouter from '../flow-routes/flowTemplate.js'

let server: ReturnType<typeof http.createServer> | null = null
const BASE = 'http://localhost:3003'

function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode ?? 0, body: { raw: data.substring(0, 500) } }) }
      })
    }).on('error', reject)
  })
}

function request(path: string, method: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`)
    const postData = body ? JSON.stringify(body) : ''
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode ?? 0, body: { raw: data.substring(0, 500) } }) }
        })
      },
    )
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: find returns chainable query
  const chainResult: unknown[] = []
  const chain = Promise.resolve(chainResult) as Promise<unknown[]> & { sort: ReturnType<typeof vi.fn>; skip: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> }
  chain.sort = vi.fn().mockReturnValue(chain)
  chain.skip = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  mockFindChain.mockReturnValue(chain)
  mockCountDocuments.mockResolvedValue(0)

  // create: returns input data as-is
  mockCreate.mockImplementation((data: Record<string, unknown>) => Promise.resolve({ ...data, toObject() { return this } }))

  // findById: default not found
  mockFindById.mockResolvedValue(null)
  mockFindOne.mockResolvedValue(null)
})

beforeAll(async () => {
  const app = new Koa()
  app.use(errorHandler)
  app.use(bodyParser())
  app.use(cors({ origin: () => '' }))
  app.use(flowTemplateRouter.routes())
  app.use(flowTemplateRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(3003, () => resolve())
  })
}, 30000)

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => { server!.close(() => resolve()) })
  }
})

describe('Flow Template API', () => {
  describe('GET /api/flow-templates', () => {
    it('returns paginated template list', async () => {
      const { status, body } = await get('/api/flow-templates')
      expect(status).toBe(200)
      expect(body.success).toBe(true)
      const data = body.data as Record<string, unknown>
      expect(data).toHaveProperty('items')
      expect(data).toHaveProperty('total')
      expect(data).toHaveProperty('page')
      expect(data).toHaveProperty('pageSize')
      expect(Array.isArray(data.items)).toBe(true)
    })

    it('supports search filter', async () => {
      const { status, body } = await get('/api/flow-templates?search=test')
      expect(status).toBe(200)
      expect(body.success).toBe(true)
    })

    it('supports category filter', async () => {
      const { status, body } = await get('/api/flow-templates?category=other')
      expect(status).toBe(200)
      expect(body.success).toBe(true)
    })

    it('supports pagination params', async () => {
      const { status, body } = await get('/api/flow-templates?page=1&pageSize=5')
      expect(status).toBe(200)
      const data = body.data as Record<string, unknown>
      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(5)
    })
  })

  describe('POST /api/flow-templates', () => {
    it('creates a new template', async () => {
      const { status, body } = await request('/api/flow-templates', 'POST', {
        name: 'Test Template',
        description: 'A test template',
        category: 'test',
        graph: { nodes: [], edges: [] },
        tags: ['test'],
      })
      expect(status).toBe(201)
      expect(body.success).toBe(true)
      const data = body.data as Record<string, unknown>
      expect(data.name).toBe('Test Template')
      expect(data.isBuiltin).toBe(false)
    })

    it('returns 400 for missing name', async () => {
      const { status, body } = await request('/api/flow-templates', 'POST', {
        graph: { nodes: [], edges: [] },
      })
      expect(status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('returns 400 for missing graph', async () => {
      const { status, body } = await request('/api/flow-templates', 'POST', {
        name: 'Test',
      })
      expect(status).toBe(400)
      expect(body.success).toBe(false)
    })
  })

  describe('GET /api/flow-templates/:id', () => {
    it('returns 400 for invalid UUID', async () => {
      const { status, body } = await get('/api/flow-templates/not-a-uuid')
      expect(status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('returns 404 for non-existent template', async () => {
      const { status, body } = await get('/api/flow-templates/aaaaaaaaaaaaaaaaaaaaaaaa')
      expect(status).toBe(404)
      expect(body.success).toBe(false)
    })
  })

  describe('DELETE /api/flow-templates/:id', () => {
    it('returns 400 for invalid UUID', async () => {
      const { status, body } = await request('/api/flow-templates/not-a-uuid', 'DELETE')
      expect(status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('returns 404 for non-existent template', async () => {
      const { status, body } = await request('/api/flow-templates/aaaaaaaaaaaaaaaaaaaaaaaa', 'DELETE')
      expect(status).toBe(404)
      expect(body.success).toBe(false)
    })
  })

  describe('POST /api/flow-templates/:id/apply', () => {
    it('returns 400 for invalid UUID', async () => {
      const { status, body } = await request('/api/flow-templates/not-a-uuid/apply', 'POST', {})
      expect(status).toBe(400)
      expect(body.success).toBe(false)
    })

    it('returns 404 for non-existent template', async () => {
      const { status, body } = await request('/api/flow-templates/aaaaaaaaaaaaaaaaaaaaaaaa/apply', 'POST', {})
      expect(status).toBe(404)
      expect(body.success).toBe(false)
    })
  })

  describe('POST /api/flow-templates/seed', () => {
    it('seeds built-in templates', async () => {
      // findOne returns null → all templates are "new"
      mockFindOne.mockResolvedValue(null)
      mockCreate.mockImplementation((data: Record<string, unknown>) => Promise.resolve({ ...data, _id: 'new-id', toObject() { return this } }))

      const { status, body } = await request('/api/flow-templates/seed', 'POST')
      expect(status).toBe(200)
      expect(body.success).toBe(true)
      const data = body.data as Record<string, unknown>
      expect(typeof data.created).toBe('number')
      expect(data.created).toBeGreaterThan(0)
      expect(typeof data.updated).toBe('number')
    })

    it('is idempotent on second call', async () => {
      // First call: create all templates
      mockFindOne.mockResolvedValue(null)
      mockCreate.mockImplementation((data: Record<string, unknown>) => Promise.resolve({ ...data, _id: 'new-id', toObject() { return this } }))

      const { body: first } = await request('/api/flow-templates/seed', 'POST')
      const firstData = first.data as Record<string, unknown>
      const totalFirst = (firstData.created as number) + (firstData.updated as number)

      // Second call: all templates already exist → updated
      mockFindOne.mockResolvedValue({ _id: 'existing', toObject() { return { _id: 'existing' } } })

      const { body: second } = await request('/api/flow-templates/seed', 'POST')
      const secondData = second.data as Record<string, unknown>
      expect(secondData.updated).toBe(totalFirst)
      expect(secondData.created).toBe(0)
    })
  })
})

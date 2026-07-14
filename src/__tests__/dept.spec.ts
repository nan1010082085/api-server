/**
 * Dept CRUD + Tree API Tests
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import { errorHandler } from '../middleware/errorHandler.js'
import deptsRouter from '../routes/depts.js'
import { DeptModel } from '../models/Dept.js'
import { UserModel } from '../models/User.js'
import { connectDatabase, mongoose } from '../config/database.js'

const BASE = 'http://localhost:3004'

let server: ReturnType<typeof http.createServer> | null = null

function request(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode ?? 0, body: data.substring(0, 500) }) }
      })
    })

    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

beforeAll(async () => {
  await connectDatabase()

  const app = new Koa()
  app.use(errorHandler)
  app.use(bodyParser())
  app.use(cors({ origin: () => '' }))
  app.use(deptsRouter.routes())
  app.use(deptsRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(3004, () => resolve())
  })
}, 30000)

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => { server!.close(() => resolve()) })
  }
  await mongoose.disconnect()
})

beforeEach(async () => {
  await DeptModel.deleteMany({})
  await UserModel.deleteMany({})
  // Re-create admin user so authMiddleware dev fallback works
  await UserModel.create({
    username: 'admin',
    password: 'hashed',
    displayName: 'Admin',
    roles: [],
    tenantId: '000000',
    status: 'active',
  })
})

describe('Dept CRUD API', () => {
  // ── POST /api/depts ──

  it('POST /api/depts creates a root department', async () => {
    const { status, body } = await request('POST', '/api/depts', {
      name: '总公司',
    })

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('总公司')
    expect(body.data.parentId).toBeNull()
    expect(body.data.sort).toBe(0)
    expect(body.data.status).toBe('active')
    expect(body.data.leader).toBe('')
    expect(body.data.id).toBeDefined()
    expect(body.data.createdAt).toBeDefined()
  })

  it('POST /api/depts creates a child department', async () => {
    const parent = await DeptModel.create({ name: '总公司' })

    const { status, body } = await request('POST', '/api/depts', {
      name: '技术部',
      parentId: parent._id,
      sort: 1,
      leader: '张三',
    })

    expect(status).toBe(201)
    expect(body.data.parentId).toBe(String(parent._id))
    expect(body.data.sort).toBe(1)
    expect(body.data.leader).toBe('张三')
  })

  it('POST /api/depts validates required name', async () => {
    const { status, body } = await request('POST', '/api/depts', {})

    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('POST /api/depts rejects non-existent parentId', async () => {
    const fakeId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const { status, body } = await request('POST', '/api/depts', {
      name: 'Test',
      parentId: fakeId,
    })

    expect(status).toBe(400)
    expect(body.error.message).toContain('Parent department not found')
  })

  it('POST /api/depts rejects duplicate name at same level', async () => {
    const root = await DeptModel.create({ name: '总公司' })
    await DeptModel.create({ name: '技术部', parentId: root._id })

    const { status, body } = await request('POST', '/api/depts', {
      name: '技术部',
      parentId: root._id,
    })

    expect(status).toBe(409)
    expect(body.error.message).toContain('同名部门')
  })

  it('POST /api/depts allows same name under different parents', async () => {
    const rootA = await DeptModel.create({ name: 'A公司' })
    const rootB = await DeptModel.create({ name: 'B公司' })

    await request('POST', '/api/depts', { name: '技术部', parentId: rootA._id })
    const { status } = await request('POST', '/api/depts', { name: '技术部', parentId: rootB._id })

    expect(status).toBe(201)
  })

  // ── GET /api/depts ──

  it('GET /api/depts lists flat departments', async () => {
    const d1 = await DeptModel.create({ name: 'A' })
    await DeptModel.create({ name: 'B', parentId: d1._id })

    const { status, body } = await request('GET', '/api/depts')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items).toHaveLength(2)
    expect(body.data.total).toBe(2)
  })

  it('GET /api/depts supports search', async () => {
    await DeptModel.create({ name: '技术部' })
    await DeptModel.create({ name: '市场部' })

    const { body } = await request('GET', '/api/depts?search=技术')

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].name).toBe('技术部')
  })

  it('GET /api/depts supports status filter', async () => {
    await DeptModel.create({ name: 'Active', status: 'active' })
    await DeptModel.create({ name: 'Inactive', status: 'inactive' })

    const { body } = await request('GET', '/api/depts?status=active')

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].status).toBe('active')
  })

  it('GET /api/depts supports parentId filter', async () => {
    const root = await DeptModel.create({ name: 'Root' })
    await DeptModel.create({ name: 'Child', parentId: root._id })
    await DeptModel.create({ name: 'Other' })

    const { body } = await request('GET', `/api/depts?parentId=${root._id}`)

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].name).toBe('Child')
  })

  // ── GET /api/depts?tree=true ──

  it('GET /api/depts?tree=true returns tree structure', async () => {
    const root = await DeptModel.create({ name: '总公司', sort: 0 })
    const tech = await DeptModel.create({ name: '技术部', parentId: root._id, sort: 2 })
    await DeptModel.create({ name: '人事部', parentId: root._id, sort: 1 })
    await DeptModel.create({ name: '前端组', parentId: tech._id, sort: 1 })
    await DeptModel.create({ name: '后端组', parentId: tech._id, sort: 0 })

    const { status, body } = await request('GET', '/api/depts?tree=true')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    // Root level
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('总公司')
    // Children sorted by sort field (hr=1 before tech=2)
    expect(body.data[0].children).toHaveLength(2)
    expect(body.data[0].children[0].name).toBe('人事部')
    expect(body.data[0].children[1].name).toBe('技术部')
    // Grandchildren sorted by sort field (be=0 before fe=1)
    expect(body.data[0].children[1].children).toHaveLength(2)
    expect(body.data[0].children[1].children[0].name).toBe('后端组')
    expect(body.data[0].children[1].children[1].name).toBe('前端组')
  })

  it('GET /api/depts?tree=true with search filters before building tree', async () => {
    const root = await DeptModel.create({ name: '总公司' })
    await DeptModel.create({ name: '技术部', parentId: root._id })
    await DeptModel.create({ name: '人事部', parentId: root._id })

    const { body } = await request('GET', '/api/depts?tree=true&search=技术')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('技术部')
  })

  // ── GET /api/depts/:id ──

  it('GET /api/depts/:id returns a department', async () => {
    const dept = await DeptModel.create({ name: '测试部' })

    const { status, body } = await request('GET', `/api/depts/${dept._id}`)

    expect(status).toBe(200)
    expect(body.data.name).toBe('测试部')
  })

  it('GET /api/depts/:id returns 404 for missing dept', async () => {
    const fakeId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const { status, body } = await request('GET', `/api/depts/${fakeId}`)

    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('GET /api/depts/:id rejects invalid UUID', async () => {
    const { status } = await request('GET', '/api/depts/not-a-uuid')

    expect(status).toBe(400)
  })

  // ── PUT /api/depts/:id ──

  it('PUT /api/depts/:id updates a department', async () => {
    const dept = await DeptModel.create({ name: 'Old Name' })

    const { status, body } = await request('PUT', `/api/depts/${dept._id}`, { name: 'New Name', leader: '李四' })

    expect(status).toBe(200)
    expect(body.data.name).toBe('New Name')
    expect(body.data.leader).toBe('李四')
  })

  it('PUT /api/depts/:id rejects duplicate name at same level', async () => {
    const root = await DeptModel.create({ name: 'Root' })
    await DeptModel.create({ name: 'A部', parentId: root._id })
    const b = await DeptModel.create({ name: 'B部', parentId: root._id })

    const { status, body } = await request('PUT', `/api/depts/${b._id}`, { name: 'A部' })

    expect(status).toBe(409)
    expect(body.error.message).toContain('同名部门')
  })

  it('PUT /api/depts/:id returns 404 for missing dept', async () => {
    const fakeId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const { status } = await request('PUT', `/api/depts/${fakeId}`, { name: 'Nope' })

    expect(status).toBe(404)
  })

  // ── PATCH /api/depts/:id/move ──

  it('PATCH /api/depts/:id/move moves to new parent', async () => {
    const root = await DeptModel.create({ name: 'Root' })
    const a = await DeptModel.create({ name: 'A公司' })
    const dept = await DeptModel.create({ name: '技术部', parentId: root._id })

    const { status, body } = await request('PATCH', `/api/depts/${dept._id}/move`, { parentId: a._id })

    expect(status).toBe(200)
    expect(body.data.parentId).toBe(String(a._id))
  })

  it('PATCH /api/depts/:id/move moves to root', async () => {
    const root = await DeptModel.create({ name: 'Root' })
    const dept = await DeptModel.create({ name: '技术部', parentId: root._id })

    const { status, body } = await request('PATCH', `/api/depts/${dept._id}/move`, { parentId: null })

    expect(status).toBe(200)
    expect(body.data.parentId).toBeNull()
  })

  it('PATCH /api/depts/:id/move rejects self-referencing', async () => {
    const dept = await DeptModel.create({ name: 'Self' })

    const { status, body } = await request('PATCH', `/api/depts/${dept._id}/move`, { parentId: dept._id })

    expect(status).toBe(400)
    expect(body.error.message).toContain('under itself')
  })

  it('PATCH /api/depts/:id/move detects cycle', async () => {
    // A -> B -> C, try to move A under C (would create cycle)
    const a = await DeptModel.create({ name: 'A', parentId: null })
    const b = await DeptModel.create({ name: 'B', parentId: a._id })
    const c = await DeptModel.create({ name: 'C', parentId: b._id })

    const { status, body } = await request('PATCH', `/api/depts/${a._id}/move`, { parentId: c._id })

    expect(status).toBe(400)
    expect(body.error.message).toContain('cycle')
  })

  it('PATCH /api/depts/:id/move rejects duplicate name at target level', async () => {
    const root = await DeptModel.create({ name: 'Root' })
    const a = await DeptModel.create({ name: 'A公司' })
    const techA = await DeptModel.create({ name: '技术部', parentId: root._id })
    await DeptModel.create({ name: '技术部', parentId: a._id })

    const { status, body } = await request('PATCH', `/api/depts/${techA._id}/move`, { parentId: a._id })

    expect(status).toBe(409)
    expect(body.error.message).toContain('同名部门')
  })

  // ── DELETE /api/depts/:id ──

  it('DELETE /api/depts/:id deletes a leaf department', async () => {
    const dept = await DeptModel.create({ name: 'Delete Me' })

    const { status, body } = await request('DELETE', `/api/depts/${dept._id}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeNull()

    const found = await DeptModel.findById(dept._id)
    expect(found).toBeNull()
  })

  it('DELETE /api/depts/:id rejects if has children', async () => {
    const parent = await DeptModel.create({ name: 'Parent' })
    await DeptModel.create({ name: 'Child', parentId: parent._id })

    const { status, body } = await request('DELETE', `/api/depts/${parent._id}`)

    expect(status).toBe(400)
    expect(body.error.message).toContain('children')
  })

  it('DELETE /api/depts/:id rejects if has associated users', async () => {
    const dept = await DeptModel.create({ name: 'With Users' })
    await UserModel.create({ username: 'testuser', password: 'pass123', displayName: 'Test User', deptId: dept._id })

    const { status, body } = await request('DELETE', `/api/depts/${dept._id}`)

    expect(status).toBe(400)
    expect(body.error.message).toContain('associated users')
  })

  it('DELETE /api/depts/:id returns 404 for missing dept', async () => {
    const fakeId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const { status } = await request('DELETE', `/api/depts/${fakeId}`)

    expect(status).toBe(404)
  })

  // ── Response shape ──

  it('responses have consistent shape', async () => {
    const { body: listBody } = await request('GET', '/api/depts')
    expect(listBody).toHaveProperty('success')
    expect(listBody).toHaveProperty('data')
    expect(listBody.data).toHaveProperty('items')
    expect(listBody.data).toHaveProperty('total')

    const createRes = await request('POST', '/api/depts', { name: 'Shape' })
    expect(createRes.body).toHaveProperty('success')
    expect(createRes.body).toHaveProperty('data')
  })
})

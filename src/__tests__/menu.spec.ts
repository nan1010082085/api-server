/**
 * Menu CRUD + Tree + Route API Tests
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import { errorHandler } from '../middleware/errorHandler.js'
import menusRouter from '../routes/menus.js'
import { MenuModel } from '../models/Menu.js'
import { RoleModel } from '../models/Role.js'
import { UserModel } from '../models/User.js'
import { connectDatabase, mongoose } from '../config/database.js'

const BASE = 'http://localhost:3007'

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
  app.use(menusRouter.routes())
  app.use(menusRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(3007, () => resolve())
  })
}, 30000)

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => { server!.close(() => resolve()) })
  }
  await mongoose.disconnect()
})

beforeEach(async () => {
  await MenuModel.deleteMany({})
  await RoleModel.deleteMany({})
  await UserModel.deleteMany({})
})

describe('Menu CRUD API', () => {
  // ── POST /api/menus ──

  it('POST /api/menus creates a root menu', async () => {
    const { status, body } = await request('POST', '/api/menus', {
      name: '系统管理',
      path: '/system',
      icon: 'setting',
    })

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('系统管理')
    expect(body.data.path).toBe('/system')
    expect(body.data.icon).toBe('setting')
    expect(body.data.type).toBe('menu')
    expect(body.data.status).toBe('active')
    expect(body.data.sort).toBe(0)
    expect(body.data.parentId).toBeNull()
    expect(body.data.id).toBeDefined()
    expect(body.data.createdAt).toBeDefined()
  })

  it('POST /api/menus creates a child menu', async () => {
    const parent = await MenuModel.create({ name: '系统管理' })

    const { status, body } = await request('POST', '/api/menus', {
      name: '用户管理',
      parentId: parent._id,
      path: '/system/users',
      component: 'system/Users',
      sort: 1,
    })

    expect(status).toBe(201)
    expect(body.data.parentId).toBe(parent._id)
    expect(body.data.sort).toBe(1)
    expect(body.data.component).toBe('system/Users')
  })

  it('POST /api/menus creates a button type', async () => {
    const { status, body } = await request('POST', '/api/menus', {
      name: '新增用户',
      type: 'button',
      permission: 'system:user:add',
    })

    expect(status).toBe(201)
    expect(body.data.type).toBe('button')
    expect(body.data.permission).toBe('system:user:add')
  })

  it('POST /api/menus validates required name', async () => {
    const { status, body } = await request('POST', '/api/menus', {})

    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('POST /api/menus rejects non-existent parentId', async () => {
    const { status, body } = await request('POST', '/api/menus', {
      name: 'Test',
      parentId: '00000000-0000-0000-0000-000000000000',
    })

    expect(status).toBe(400)
    expect(body.error.message).toContain('Parent menu not found')
  })

  it('POST /api/menus rejects invalid type', async () => {
    const { status, body } = await request('POST', '/api/menus', {
      name: 'Test',
      type: 'invalid',
    })

    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })

  // ── GET /api/menus ──

  it('GET /api/menus lists flat menus', async () => {
    const m1 = await MenuModel.create({ name: 'A' })
    await MenuModel.create({ name: 'B', parentId: m1._id })

    const { status, body } = await request('GET', '/api/menus')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items).toHaveLength(2)
    expect(body.data.total).toBe(2)
  })

  it('GET /api/menus supports search', async () => {
    await MenuModel.create({ name: '系统管理' })
    await MenuModel.create({ name: '用户管理' })

    const { body } = await request('GET', '/api/menus?search=系统')

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].name).toBe('系统管理')
  })

  it('GET /api/menus supports type filter', async () => {
    await MenuModel.create({ name: '菜单', type: 'menu' })
    await MenuModel.create({ name: '按钮', type: 'button' })

    const { body } = await request('GET', '/api/menus?type=button')

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].type).toBe('button')
  })

  it('GET /api/menus supports status filter', async () => {
    await MenuModel.create({ name: 'Active', status: 'active' })
    await MenuModel.create({ name: 'Inactive', status: 'inactive' })

    const { body } = await request('GET', '/api/menus?status=active')

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].status).toBe('active')
  })

  it('GET /api/menus supports parentId filter', async () => {
    const root = await MenuModel.create({ name: 'Root' })
    await MenuModel.create({ name: 'Child', parentId: root._id })
    await MenuModel.create({ name: 'Other' })

    const { body } = await request('GET', `/api/menus?parentId=${root._id}`)

    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].name).toBe('Child')
  })

  // ── GET /api/menus?tree=true ──

  it('GET /api/menus?tree=true returns tree structure', async () => {
    const root = await MenuModel.create({ name: '系统管理', sort: 0 })
    const user = await MenuModel.create({ name: '用户管理', parentId: root._id, sort: 2 })
    await MenuModel.create({ name: '角色管理', parentId: root._id, sort: 1 })
    await MenuModel.create({ name: '新增用户', parentId: user._id, type: 'button', sort: 1 })
    await MenuModel.create({ name: '删除用户', parentId: user._id, type: 'button', sort: 0 })

    const { status, body } = await request('GET', '/api/menus?tree=true')

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    // Root level
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('系统管理')
    // Children sorted by sort field
    expect(body.data[0].children).toHaveLength(2)
    expect(body.data[0].children[0].name).toBe('角色管理')
    expect(body.data[0].children[1].name).toBe('用户管理')
    // Buttons under user management
    expect(body.data[0].children[1].children).toHaveLength(2)
    expect(body.data[0].children[1].children[0].name).toBe('删除用户')
    expect(body.data[0].children[1].children[1].name).toBe('新增用户')
  })

  it('GET /api/menus?tree=true with search filters before building tree', async () => {
    const root = await MenuModel.create({ name: '系统管理' })
    await MenuModel.create({ name: '用户管理', parentId: root._id })
    await MenuModel.create({ name: '角色管理', parentId: root._id })

    const { body } = await request('GET', '/api/menus?tree=true&search=用户')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('用户管理')
  })

  // ── GET /api/menus/:id ──

  it('GET /api/menus/:id returns a menu', async () => {
    const menu = await MenuModel.create({ name: '测试菜单' })

    const { status, body } = await request('GET', `/api/menus/${menu._id}`)

    expect(status).toBe(200)
    expect(body.data.name).toBe('测试菜单')
  })

  it('GET /api/menus/:id returns 404 for missing menu', async () => {
    const { status, body } = await request('GET', '/api/menus/00000000-0000-0000-0000-000000000000')

    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('GET /api/menus/:id rejects invalid UUID', async () => {
    const { status } = await request('GET', '/api/menus/not-a-uuid')

    expect(status).toBe(400)
  })

  // ── PUT /api/menus/:id ──

  it('PUT /api/menus/:id updates a menu', async () => {
    const menu = await MenuModel.create({ name: 'Old Name' })

    const { status, body } = await request('PUT', `/api/menus/${menu._id}`, { name: 'New Name', icon: 'user' })

    expect(status).toBe(200)
    expect(body.data.name).toBe('New Name')
    expect(body.data.icon).toBe('user')
  })

  it('PUT /api/menus/:id returns 404 for missing menu', async () => {
    const { status } = await request('PUT', '/api/menus/00000000-0000-0000-0000-000000000000', { name: 'Nope' })

    expect(status).toBe(404)
  })

  it('PUT /api/menus/:id rejects self-referencing parentId', async () => {
    const menu = await MenuModel.create({ name: 'Self' })

    const { status, body } = await request('PUT', `/api/menus/${menu._id}`, { parentId: menu._id })

    expect(status).toBe(400)
    expect(body.error.message).toContain('its own parent')
  })

  it('PUT /api/menus/:id detects cycle', async () => {
    const a = await MenuModel.create({ name: 'A', parentId: null })
    const b = await MenuModel.create({ name: 'B', parentId: a._id })
    const c = await MenuModel.create({ name: 'C', parentId: b._id })

    const { status, body } = await request('PUT', `/api/menus/${a._id}`, { parentId: c._id })

    expect(status).toBe(400)
    expect(body.error.message).toContain('cycle')
  })

  // ── DELETE /api/menus/:id ──

  it('DELETE /api/menus/:id deletes a leaf menu', async () => {
    const menu = await MenuModel.create({ name: 'Delete Me' })

    const { status, body } = await request('DELETE', `/api/menus/${menu._id}`)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeNull()

    const found = await MenuModel.findById(menu._id)
    expect(found).toBeNull()
  })

  it('DELETE /api/menus/:id rejects if has children', async () => {
    const parent = await MenuModel.create({ name: 'Parent' })
    await MenuModel.create({ name: 'Child', parentId: parent._id })

    const { status, body } = await request('DELETE', `/api/menus/${parent._id}`)

    expect(status).toBe(400)
    expect(body.error.message).toContain('children')
  })

  it('DELETE /api/menus/:id returns 404 for missing menu', async () => {
    const { status } = await request('DELETE', '/api/menus/00000000-0000-0000-0000-000000000000')

    expect(status).toBe(404)
  })

  // ── Response shape ──

  it('responses have consistent shape', async () => {
    const { body: listBody } = await request('GET', '/api/menus')
    expect(listBody).toHaveProperty('success')
    expect(listBody).toHaveProperty('data')
    expect(listBody.data).toHaveProperty('items')
    expect(listBody.data).toHaveProperty('total')

    const createRes = await request('POST', '/api/menus', { name: 'Shape' })
    expect(createRes.body).toHaveProperty('success')
    expect(createRes.body).toHaveProperty('data')
  })
})

describe('GET /api/menus/route — dynamic route tree', () => {
  beforeEach(async () => {
    // Create dev user that auth middleware falls back to in non-production
    await UserModel.create({
      _id: 'dev',
      username: 'dev',
      password: 'dev',
      displayName: 'Dev User',
      roles: [],
      tenantId: '000000',
      status: 'active',
    })
  })

  it('returns empty tree when no menus exist', async () => {
    const { status, body } = await request('GET', '/api/menus/route')

    // In dev mode, auth is skipped so we get a valid response
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
  })

  it('returns only menu type items (not buttons)', async () => {
    await MenuModel.create({ name: 'Dashboard', type: 'menu', path: '/dashboard', status: 'active' })
    await MenuModel.create({ name: 'Add Button', type: 'button', permission: 'add', status: 'active' })

    const { body } = await request('GET', '/api/menus/route')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Dashboard')
  })

  it('excludes inactive menus', async () => {
    await MenuModel.create({ name: 'Active', type: 'menu', status: 'active' })
    await MenuModel.create({ name: 'Inactive', type: 'menu', status: 'inactive' })

    const { body } = await request('GET', '/api/menus/route')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Active')
  })

  it('includes parent menus needed for tree structure', async () => {
    const parent = await MenuModel.create({ name: 'System', type: 'menu', permission: 'admin', status: 'active' })
    await MenuModel.create({ name: 'Settings', type: 'menu', parentId: parent._id, path: '/settings', status: 'active' })

    // In dev mode, all permissions are available, so both should be visible
    const { body } = await request('GET', '/api/menus/route')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('System')
    expect(body.data[0].children).toHaveLength(1)
    expect(body.data[0].children[0].name).toBe('Settings')
  })

  it('returns tree structure sorted by sort field', async () => {
    const root = await MenuModel.create({ name: 'Root', type: 'menu', sort: 0, status: 'active' })
    await MenuModel.create({ name: 'A', type: 'menu', parentId: root._id, sort: 2, status: 'active' })
    await MenuModel.create({ name: 'B', type: 'menu', parentId: root._id, sort: 1, status: 'active' })

    const { body } = await request('GET', '/api/menus/route')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].children).toHaveLength(2)
    expect(body.data[0].children[0].name).toBe('B')
    expect(body.data[0].children[1].name).toBe('A')
  })

  it('menus without permission are visible to all', async () => {
    await MenuModel.create({ name: 'Public', type: 'menu', path: '/public', permission: '', status: 'active' })

    const { body } = await request('GET', '/api/menus/route')

    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Public')
  })
})

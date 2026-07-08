/**
 * seedRoles 单元测试
 *
 * 验证：
 * 1. 首次执行：管理员 / 普通用户角色正确创建，权限完整
 * 2. 幂等性：重复执行不产生重复权限
 * 3. 追加权限：已有角色在 seed 后获得新增权限（如 apikey）
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { seedRoles } from '../seedRoles.js'
import { RoleModel } from '../../models/Role.js'
import { DEFAULT_TENANT_ID } from '../initDefaultTenant.js'

const TEST_MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-seed-roles'

beforeAll(async () => {
  mongoose.set('strictQuery', false)
  await mongoose.connect(TEST_MONGO_URI, {
    maxPoolSize: 5,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  })
}, 30000)

afterAll(async () => {
  await mongoose.disconnect()
})

beforeEach(async () => {
  try { await mongoose.connection.db!.collection('roles').drop() } catch { /* ignore */ }
})

// ── 首次创建 ──

describe('seedRoles — first run', () => {
  it('creates admin role with all permissions', async () => {
    await seedRoles()

    const admin = await RoleModel.findOne({ name: '管理员', tenantId: DEFAULT_TENANT_ID }).lean()
    expect(admin).not.toBeNull()
    expect(admin!.data_scope).toBe('all')
    expect(admin!.permissions).toContain('schema:view')
    expect(admin!.permissions).toContain('apikey:view')
    expect(admin!.permissions).toContain('apikey:create')
    expect(admin!.permissions).toContain('apikey:edit')
    expect(admin!.permissions).toContain('apikey:delete')
    expect(admin!.permissions).toContain('flow:design')
    expect(admin!.permissions).toContain('user:delete')
  })

  it('creates regular user role with basic + apikey permissions', async () => {
    await seedRoles()

    const user = await RoleModel.findOne({ name: '普通用户', tenantId: DEFAULT_TENANT_ID }).lean()
    expect(user).not.toBeNull()
    expect(user!.data_scope).toBe('self')
    expect(user!.permissions).toContain('schema:view')
    expect(user!.permissions).toContain('flow:view')
    expect(user!.permissions).toContain('flow:start')
    expect(user!.permissions).toContain('apikey:view')
    expect(user!.permissions).toContain('apikey:create')
    expect(user!.permissions).toContain('apikey:edit')
    expect(user!.permissions).toContain('apikey:delete')
  })

  it('regular user role does NOT have admin-only permissions', async () => {
    await seedRoles()

    const user = await RoleModel.findOne({ name: '普通用户', tenantId: DEFAULT_TENANT_ID }).lean()
    expect(user!.permissions).not.toContain('user:delete')
    expect(user!.permissions).not.toContain('role:create')
    expect(user!.permissions).not.toContain('tenant:delete')
    expect(user!.permissions).not.toContain('flow:design')
  })
})

// ── 幂等性 ──

describe('seedRoles — idempotency', () => {
  it('running seedRoles twice does not duplicate permissions', async () => {
    await seedRoles()
    await seedRoles()

    const admin = await RoleModel.findOne({ name: '管理员', tenantId: DEFAULT_TENANT_ID }).lean()
    const user = await RoleModel.findOne({ name: '普通用户', tenantId: DEFAULT_TENANT_ID }).lean()

    // 没有重复元素
    expect(new Set(admin!.permissions).size).toBe(admin!.permissions.length)
    expect(new Set(user!.permissions).size).toBe(user!.permissions.length)
  })

  it('running seedRoles twice does not create duplicate documents', async () => {
    await seedRoles()
    await seedRoles()

    const adminCount = await RoleModel.countDocuments({ name: '管理员', tenantId: DEFAULT_TENANT_ID })
    const userCount = await RoleModel.countDocuments({ name: '普通用户', tenantId: DEFAULT_TENANT_ID })

    expect(adminCount).toBe(1)
    expect(userCount).toBe(1)
  })
})

// ── 追加权限（模拟已有角色缺少 apikey 权限的场景） ──

describe('seedRoles — append new permissions to existing role', () => {
  it('existing user role without apikey permissions gains them after seed', async () => {
    // 模拟旧版 seed 创建的角色（没有 apikey 权限）
    await RoleModel.create({
      name: '普通用户',
      description: '旧版角色',
      permissions: ['schema:view', 'flow:view', 'flow:start'],
      data_scope: 'self',
      tenantId: DEFAULT_TENANT_ID,
    })

    await seedRoles()

    const user = await RoleModel.findOne({ name: '普通用户', tenantId: DEFAULT_TENANT_ID }).lean()
    expect(user!.permissions).toContain('apikey:view')
    expect(user!.permissions).toContain('apikey:create')
    expect(user!.permissions).toContain('apikey:edit')
    expect(user!.permissions).toContain('apikey:delete')
    // 原有权限保留
    expect(user!.permissions).toContain('schema:view')
    expect(user!.permissions).toContain('flow:view')
    expect(user!.permissions).toContain('flow:start')
  })

  it('existing admin role without apikey permissions gains them after seed', async () => {
    await RoleModel.create({
      name: '管理员',
      permissions: ['schema:view', 'user:delete'],
      data_scope: 'all',
      tenantId: DEFAULT_TENANT_ID,
    })

    await seedRoles()

    const admin = await RoleModel.findOne({ name: '管理员', tenantId: DEFAULT_TENANT_ID }).lean()
    expect(admin!.permissions).toContain('apikey:view')
    expect(admin!.permissions).toContain('apikey:create')
    expect(admin!.permissions).toContain('apikey:edit')
    expect(admin!.permissions).toContain('apikey:delete')
  })

  it('existing role keeps its custom description', async () => {
    await RoleModel.create({
      name: '普通用户',
      description: '自定义描述',
      permissions: ['schema:view'],
      data_scope: 'self',
      tenantId: DEFAULT_TENANT_ID,
    })

    await seedRoles()

    const user = await RoleModel.findOne({ name: '普通用户', tenantId: DEFAULT_TENANT_ID }).lean()
    // $setOnInsert 不会覆盖已有字段
    expect(user!.description).toBe('自定义描述')
  })
})

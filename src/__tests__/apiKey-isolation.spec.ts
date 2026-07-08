/**
 * API Key User Isolation Tests
 *
 * Verifies that API Key CRUD operations are properly user-scoped:
 * - Non-admin users can only see/manage their own keys
 * - Admin users (role with data_scope='all') can see/manage all keys
 *
 * Tests the ownership filtering logic at model level and the
 * isAdmin / buildOwnershipFilter helper functions.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { tenantStorage } from '../middleware/tenantContext.js'
import { ApiKeyModel } from '../models/ApiKey.js'
import { RoleModel } from '../models/Role.js'
import { isAdmin, buildOwnershipFilter } from '../routes/apiKey.js'

const TEST_MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-apikey-isolation'

/** Run a function within a specific tenant context */
async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantStorage.run({ tenantId }, async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
  })
}

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
  await mongoose.connection.db!.collection('apikeys').deleteMany({})
  await mongoose.disconnect()
})

beforeEach(async () => {
  const db = mongoose.connection.db!
  try { await db.collection('apikeys').drop() } catch { /* ignore */ }
  try { await db.collection('roles').drop() } catch { /* ignore */ }
})

// ── Helper ──

async function createKey(createdBy: string, tenantId: string, name: string) {
  return withTenant(tenantId, () =>
    ApiKeyModel.create({ name, createdBy, permissions: ['test:read'] }),
  )
}

// ── isAdmin() ──

describe('isAdmin()', () => {
  it('returns false for user with no roles', async () => {
    expect(await isAdmin('user-1', [])).toBe(false)
  })

  it('returns false for user with self-scoped role', async () => {
    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self' })
    expect(await isAdmin('user-1', [role._id.toString()])).toBe(false)
  })

  it('returns true for user with all-scoped role', async () => {
    const role = await RoleModel.create({ name: '管理员', data_scope: 'all' })
    expect(await isAdmin('user-1', [role._id.toString()])).toBe(true)
  })

  it('returns true when user has mixed roles including all', async () => {
    const selfRole = await RoleModel.create({ name: '普通用户', data_scope: 'self' })
    const allRole = await RoleModel.create({ name: '管理员', data_scope: 'all' })
    expect(await isAdmin('user-1', [selfRole._id.toString(), allRole._id.toString()])).toBe(true)
  })

  it('returns false when all roles are non-admin', async () => {
    const roleA = await RoleModel.create({ name: '角色A', data_scope: 'self' })
    const roleB = await RoleModel.create({ name: '角色B', data_scope: 'dept' })
    expect(await isAdmin('user-1', [roleA._id.toString(), roleB._id.toString()])).toBe(false)
  })
})

// ── buildOwnershipFilter() ──

describe('buildOwnershipFilter()', () => {
  it('includes createdBy for non-admin user', async () => {
    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self' })
    const user = { id: 'user-1', roles: [role._id.toString()], tenantId: 't-1' }

    const filter = await buildOwnershipFilter(user)

    expect(filter).toEqual({ tenantId: 't-1', createdBy: 'user-1' })
  })

  it('does not include createdBy for admin user', async () => {
    const role = await RoleModel.create({ name: '管理员', data_scope: 'all' })
    const user = { id: 'admin-1', roles: [role._id.toString()], tenantId: 't-1' }

    const filter = await buildOwnershipFilter(user)

    expect(filter).toEqual({ tenantId: 't-1' })
    expect(filter.createdBy).toBeUndefined()
  })

  it('includes createdBy for user with no roles', async () => {
    const user = { id: 'user-norole', roles: [], tenantId: 't-1' }

    const filter = await buildOwnershipFilter(user)

    expect(filter).toEqual({ tenantId: 't-1', createdBy: 'user-norole' })
  })
})

// ── List isolation (model-level) ──

describe('API Key isolation — list', () => {
  it('non-admin filter returns only own keys', async () => {
    const tenantId = 'tenant-list-1'
    const userA = 'user-a'
    const userB = 'user-b'

    await createKey(userA, tenantId, 'Key A1')
    await createKey(userA, tenantId, 'Key A2')
    await createKey(userB, tenantId, 'Key B1')

    // Simulate non-admin filter
    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userA, roles: [role._id.toString()], tenantId })

    const keys = await withTenant(tenantId, () => ApiKeyModel.find(filter).lean())

    expect(keys).toHaveLength(2)
    expect(keys.map(k => k.name).sort()).toEqual(['Key A1', 'Key A2'])
  })

  it('admin filter returns all keys in tenant', async () => {
    const tenantId = 'tenant-list-2'
    const adminId = 'admin-1'
    const userId = 'user-1'

    await createKey(adminId, tenantId, 'Admin Key')
    await createKey(userId, tenantId, 'User Key 1')
    await createKey(userId, tenantId, 'User Key 2')

    const role = await RoleModel.create({ name: '管理员', data_scope: 'all', tenantId })
    const filter = await buildOwnershipFilter({ id: adminId, roles: [role._id.toString()], tenantId })

    const keys = await withTenant(tenantId, () => ApiKeyModel.find(filter).lean())

    expect(keys).toHaveLength(3)
  })

  it('non-admin with no keys gets empty list', async () => {
    const tenantId = 'tenant-list-3'
    const userId = 'user-empty'
    const otherUser = 'user-other'

    await createKey(otherUser, tenantId, 'Other Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userId, roles: [role._id.toString()], tenantId })

    const keys = await withTenant(tenantId, () => ApiKeyModel.find(filter).lean())

    expect(keys).toHaveLength(0)
  })
})

// ── Detail / single-key isolation (model-level) ──

describe('API Key isolation — detail', () => {
  it('non-admin cannot find another user\'s key', async () => {
    const tenantId = 'tenant-det-1'
    const userA = 'user-a'
    const userB = 'user-b'

    const keyB = await createKey(userB, tenantId, 'B\'s Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userA, roles: [role._id.toString()], tenantId })
    filter._id = keyB._id

    const found = await withTenant(tenantId, () => ApiKeyModel.findOne(filter).lean())

    expect(found).toBeNull()
  })

  it('non-admin can find their own key', async () => {
    const tenantId = 'tenant-det-2'
    const userId = 'user-self'

    const myKey = await createKey(userId, tenantId, 'My Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userId, roles: [role._id.toString()], tenantId })
    filter._id = myKey._id

    const found = await withTenant(tenantId, () => ApiKeyModel.findOne(filter).lean())

    expect(found).not.toBeNull()
    expect(found!.name).toBe('My Key')
  })

  it('admin can find any user\'s key', async () => {
    const tenantId = 'tenant-det-3'
    const adminId = 'admin-1'
    const userId = 'user-1'

    const userKey = await createKey(userId, tenantId, 'User Key')

    const role = await RoleModel.create({ name: '管理员', data_scope: 'all', tenantId })
    const filter = await buildOwnershipFilter({ id: adminId, roles: [role._id.toString()], tenantId })
    filter._id = userKey._id

    const found = await withTenant(tenantId, () => ApiKeyModel.findOne(filter).lean())

    expect(found).not.toBeNull()
    expect(found!.name).toBe('User Key')
  })
})

// ── Delete isolation (model-level) ──

describe('API Key isolation — delete', () => {
  it('non-admin cannot delete another user\'s key', async () => {
    const tenantId = 'tenant-del-1'
    const userA = 'user-a'
    const userB = 'user-b'

    const keyB = await createKey(userB, tenantId, 'B\'s Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userA, roles: [role._id.toString()], tenantId })
    filter._id = keyB._id

    const deleted = await withTenant(tenantId, () => ApiKeyModel.findOneAndDelete(filter))

    expect(deleted).toBeNull()

    // Key still exists
    const stillThere = await ApiKeyModel.findById(keyB._id)
    expect(stillThere).not.toBeNull()
  })

  it('non-admin can delete their own key', async () => {
    const tenantId = 'tenant-del-2'
    const userId = 'user-self'

    const myKey = await createKey(userId, tenantId, 'My Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userId, roles: [role._id.toString()], tenantId })
    filter._id = myKey._id

    const deleted = await withTenant(tenantId, () => ApiKeyModel.findOneAndDelete(filter))

    expect(deleted).not.toBeNull()
    expect(deleted!.name).toBe('My Key')

    const gone = await ApiKeyModel.findById(myKey._id)
    expect(gone).toBeNull()
  })

  it('admin can delete any user\'s key', async () => {
    const tenantId = 'tenant-del-3'
    const adminId = 'admin-1'
    const userId = 'user-1'

    const userKey = await createKey(userId, tenantId, 'User Key')

    const role = await RoleModel.create({ name: '管理员', data_scope: 'all', tenantId })
    const filter = await buildOwnershipFilter({ id: adminId, roles: [role._id.toString()], tenantId })
    filter._id = userKey._id

    const deleted = await withTenant(tenantId, () => ApiKeyModel.findOneAndDelete(filter))

    expect(deleted).not.toBeNull()

    const gone = await ApiKeyModel.findById(userKey._id)
    expect(gone).toBeNull()
  })
})

// ── Status update isolation (model-level) ──

describe('API Key isolation — status update', () => {
  it('non-admin cannot update another user\'s key status', async () => {
    const tenantId = 'tenant-patch-1'
    const userA = 'user-a'
    const userB = 'user-b'

    const keyB = await createKey(userB, tenantId, 'B\'s Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userA, roles: [role._id.toString()], tenantId })
    filter._id = keyB._id

    const updated = await withTenant(tenantId, () =>
      ApiKeyModel.findOneAndUpdate(filter, { $set: { status: 'disabled' } }, { new: true }),
    )

    expect(updated).toBeNull()

    // Key status unchanged
    const unchanged = await ApiKeyModel.findById(keyB._id)
    expect(unchanged!.status).toBe('active')
  })

  it('non-admin can update their own key status', async () => {
    const tenantId = 'tenant-patch-2'
    const userId = 'user-self'

    const myKey = await createKey(userId, tenantId, 'My Key')

    const role = await RoleModel.create({ name: '普通用户', data_scope: 'self', tenantId })
    const filter = await buildOwnershipFilter({ id: userId, roles: [role._id.toString()], tenantId })
    filter._id = myKey._id

    const updated = await withTenant(tenantId, () =>
      ApiKeyModel.findOneAndUpdate(filter, { $set: { status: 'disabled' } }, { new: true }),
    )

    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('disabled')
  })

  it('admin can update any user\'s key status', async () => {
    const tenantId = 'tenant-patch-3'
    const adminId = 'admin-1'
    const userId = 'user-1'

    const userKey = await createKey(userId, tenantId, 'User Key')

    const role = await RoleModel.create({ name: '管理员', data_scope: 'all', tenantId })
    const filter = await buildOwnershipFilter({ id: adminId, roles: [role._id.toString()], tenantId })
    filter._id = userKey._id

    const updated = await withTenant(tenantId, () =>
      ApiKeyModel.findOneAndUpdate(filter, { $set: { status: 'disabled' } }, { new: true }),
    )

    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('disabled')
  })
})

// ── Cross-tenant isolation ──

describe('API Key isolation — cross-tenant', () => {
  it('user cannot see keys from another tenant', async () => {
    const tenantA = 'tenant-cross-a'
    const tenantB = 'tenant-cross-b'
    const userId = 'user-cross'

    await createKey(userId, tenantA, 'My Tenant Key')
    await createKey('other', tenantB, 'Other Tenant Key')

    const role = await RoleModel.create({ name: '管理员', data_scope: 'all', tenantId: tenantA })
    const filter = await buildOwnershipFilter({ id: userId, roles: [role._id.toString()], tenantId: tenantA })

    const keys = await withTenant(tenantA, () => ApiKeyModel.find(filter).lean())

    expect(keys).toHaveLength(1)
    expect(keys[0].name).toBe('My Tenant Key')
  })
})

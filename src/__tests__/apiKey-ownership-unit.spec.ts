/**
 * API Key ownership filter unit tests (no Mongo required).
 *
 * Admin bypass (intentional): roles with data_scope === 'all' omit createdBy.
 * Non-admin always get createdBy = user.id. See also apiKey-isolation.spec.ts
 * for full model-level multi-tenant matrix (requires MongoDB).
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const roleFind = vi.fn()

vi.mock('../models/Role.js', () => ({
  RoleModel: {
    find: (...args: unknown[]) => roleFind(...args),
  },
}))

import { isAdmin, buildOwnershipFilter } from '../routes/apiKey.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isAdmin / buildOwnershipFilter (mocked)', () => {
  it('non-admin filter includes createdBy', async () => {
    roleFind.mockReturnValue({
      select: () => ({ lean: async () => [{ data_scope: 'self' }] }),
    })

    const filter = await buildOwnershipFilter({
      id: 'user-a',
      roles: ['role-1'],
      tenantId: 't1',
    })
    expect(filter).toEqual({ tenantId: 't1', createdBy: 'user-a' })
    expect(await isAdmin('user-a', ['role-1'])).toBe(false)
  })

  it('admin data_scope=all omits createdBy (intentional bypass)', async () => {
    roleFind.mockReturnValue({
      select: () => ({ lean: async () => [{ data_scope: 'all' }] }),
    })

    const filter = await buildOwnershipFilter({
      id: 'admin-1',
      roles: ['role-admin'],
      tenantId: 't1',
    })
    expect(filter).toEqual({ tenantId: 't1' })
    expect(filter.createdBy).toBeUndefined()
    expect(await isAdmin('admin-1', ['role-admin'])).toBe(true)
  })

  it('empty roles treated as non-admin', async () => {
    const filter = await buildOwnershipFilter({
      id: 'user-b',
      roles: [],
      tenantId: 't2',
    })
    expect(filter).toEqual({ tenantId: 't2', createdBy: 'user-b' })
    expect(roleFind).not.toHaveBeenCalled()
  })
})

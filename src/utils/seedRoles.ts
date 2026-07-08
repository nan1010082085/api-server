import { RoleModel } from '../models/Role.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

/** 普通用户角色的基础权限 */
const USER_BASIC_PERMISSIONS = [
  'schema:view',
  'flow:view', 'flow:start',
  'apikey:view', 'apikey:create', 'apikey:edit', 'apikey:delete',
]

/** 管理员角色的全部权限 */
const ADMIN_ALL_PERMISSIONS = [
  'microapp:view', 'microapp:create', 'microapp:edit', 'microapp:delete',
  'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
  'user:view', 'user:create', 'user:edit', 'user:delete', 'user:reset-password',
  'role:view', 'role:create', 'role:edit', 'role:delete',
  'dept:view', 'dept:create', 'dept:edit', 'dept:delete',
  'post:view', 'post:create', 'post:edit', 'post:delete',
  'dict:view', 'dict:create', 'dict:edit', 'dict:delete',
  'config:view', 'config:create', 'config:edit', 'config:delete',
  'audit:view', 'audit:export',
  'schema:view', 'schema:create', 'schema:edit', 'schema:delete', 'schema:publish',
  'flow:view', 'flow:create', 'flow:edit', 'flow:delete', 'flow:design', 'flow:approve', 'flow:monitor', 'flow:publish', 'flow:start',
  'tenant:view', 'tenant:create', 'tenant:edit', 'tenant:delete',
  'apikey:view', 'apikey:create', 'apikey:edit', 'apikey:delete',
  'workflow:execute',
  'webhook:view', 'webhook:create', 'webhook:edit', 'webhook:delete',
]

/**
 * 创建 / 更新默认角色（幂等）
 *
 * - 管理员：拥有所有权限
 * - 普通用户：基础查看 + apikey 自管理（注册用户自动分配）
 *
 * 使用 findOneAndUpdate + upsert + $addToSet 保证：
 *   1. 首次执行：创建角色并写入全部权限
 *   2. 重复执行：不产生重复权限，已存在角色也能追加新增权限
 */
export async function seedRoles(): Promise<void> {
  // ── 管理员角色 ──
  await RoleModel.findOneAndUpdate(
    { name: '管理员', tenantId: DEFAULT_TENANT_ID },
    {
      $setOnInsert: {
        name: '管理员',
        data_scope: 'all',
        tenantId: DEFAULT_TENANT_ID,
      },
      $addToSet: { permissions: { $each: ADMIN_ALL_PERMISSIONS } },
    },
    { upsert: true },
  )

  // ── 普通用户角色（注册用户自动分配） ──
  await RoleModel.findOneAndUpdate(
    { name: '普通用户', tenantId: DEFAULT_TENANT_ID },
    {
      $setOnInsert: {
        name: '普通用户',
        description: '注册用户默认角色，基础查看 + apikey 自管理权限',
        data_scope: 'self',
        tenantId: DEFAULT_TENANT_ID,
      },
      $addToSet: { permissions: { $each: USER_BASIC_PERMISSIONS } },
    },
    { upsert: true },
  )
}

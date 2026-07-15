import { RoleModel } from '../models/Role.js'
import { PermissionModel } from '../models/Permission.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

/** 普通用户角色的基础权限 */
const USER_BASIC_PERMISSIONS = [
  'schema:view',
  'flow:view', 'flow:start',
  'apikey:view', 'apikey:create', 'apikey:edit', 'apikey:delete',
]

/**
 * 创建 / 更新默认角色（幂等）
 *
 * - 管理员：自动拥有全部权限（从 permissions 集合动态读取，无需维护硬编码列表）
 * - 普通用户：基础查看 + apikey 自管理（注册用户自动分配）
 */
export async function seedRoles(): Promise<void> {
  // 从 permissions 集合动态获取全部权限码
  const allPerms = await PermissionModel.find({}, { code: 1 }).lean() as unknown as { code: string }[]
  const allCodes = allPerms.map(p => p.code)

  // ── 管理员角色 ──
  await RoleModel.findOneAndUpdate(
    { name: '管理员', tenantId: DEFAULT_TENANT_ID },
    {
      $setOnInsert: {
        name: '管理员',
        data_scope: 'all',
        tenantId: DEFAULT_TENANT_ID,
      },
      $set: { permissions: allCodes },
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

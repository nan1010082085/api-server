import { UserModel } from '../models/User.js'
import { RoleModel } from '../models/Role.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

/**
 * 创建默认管理员账号
 *
 * 用户名: admin
 * 密码: admin123456
 * 租户: 默认租户 (000000)
 * 角色: 管理员
 *
 * 幂等：admin 已存在时不重建账号，但会校验并补齐管理员角色绑定。
 * 历史上 admin.roles 可能被清空（迁移 / 手动改动 / seed 顺序问题），
 * 导致 requirePermission 中间件拿到空 roles，admin 也被判 403。
 * 这里在每次 seed 时确保 admin 至少绑定本租户的「管理员」角色（data_scope=all）。
 */
export async function seedAdmin(): Promise<void> {
  // 获取管理员角色 ID
  const adminRole = await RoleModel.findOne({
    name: '管理员',
    tenantId: DEFAULT_TENANT_ID,
  })

  if (!adminRole) {
    console.log('[seed] Admin role not found, skipping admin user creation')
    return
  }

  const existing = await UserModel.findOne({
    username: 'admin',
    tenantId: DEFAULT_TENANT_ID,
  })

  if (!existing) {
    await UserModel.create({
      username: 'admin',
      password: 'admin123456',
      displayName: '系统管理员',
      roles: [adminRole._id],
      tenantId: DEFAULT_TENANT_ID,
      status: 'active',
    })
    console.log('[seed] Admin user created: admin / admin123456')
    return
  }

  // admin 已存在：确保管理员角色已绑定（自愈空 roles 场景）
  const adminRoleIdStr = String(adminRole._id)
  const currentRoles = (existing.roles || []).map(String)
  if (!currentRoles.includes(adminRoleIdStr)) {
    const merged = Array.from(new Set([...currentRoles, adminRoleIdStr]))
    await UserModel.updateOne({ _id: existing._id }, { $set: { roles: merged } })
    console.log(`[seed] Admin user roles repaired: ${currentRoles.length} -> ${merged.length} roles`)
  } else {
    console.log('[seed] Admin user already exists, roles OK')
  }
}

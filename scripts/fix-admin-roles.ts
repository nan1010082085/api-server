/**
 * 一次性修复脚本：补齐 admin 用户的「管理员」角色绑定 + 清权限缓存。
 *
 * 背景：admin.roles 在某些场景（迁移 / 手动改动 / seed 顺序）下可能被清空，
 * 导致 requirePermission 中间件拿到空 roles，admin 也被判 403。
 * 此脚本幂等：只补不删，不重建账号，不动其它用户。
 *
 * 连接：通过 SSH 隧道本地端口 12020
 * （ssh -f -N -L 12020:127.0.0.1:27017 ubuntu@pyflow.icu），远程库 schema-form。
 * 不读 .env（.env 里是 12018，该隧道当前未通）。
 *
 * 运行方式：
 *   npx tsx scripts/fix-admin-roles.ts
 */
import mongoose from 'mongoose'
import { UserModel } from '../src/models/User.js'
import { RoleModel } from '../src/models/Role.js'
import { DEFAULT_TENANT_ID } from '../src/utils/initDefaultTenant.js'
import { invalidatePermissionCache } from '../src/middleware/permission.js'

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://formgrid:formgrid2026@127.0.0.1:12020/schema-form?authSource=admin'

async function main(): Promise<void> {
  console.log('连接数据库...')
  console.log('MONGODB_URI =', MONGODB_URI.replace(/:[^:@]+@/, ':****@'))
  mongoose.set('strictQuery', false)
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  })
  console.log('[db] MongoDB connected')

  const adminRole = await RoleModel.findOne({
    name: '管理员',
    tenantId: DEFAULT_TENANT_ID,
  })
  if (!adminRole) {
    console.error('未找到「管理员」角色（tenantId=000000），请先运行 pnpm db:seed')
    process.exit(1)
  }

  const admin = await UserModel.findOne({
    username: 'admin',
    tenantId: DEFAULT_TENANT_ID,
  })
  if (!admin) {
    console.error('未找到 admin 用户，请先运行 pnpm db:seed')
    process.exit(1)
  }

  const adminRoleIdStr = String(adminRole._id)
  const before = (admin.roles || []).map(String)
  console.log('修复前 admin.roles =', JSON.stringify(before))
  console.log('管理员角色 _id =', adminRoleIdStr, 'data_scope =', adminRole.data_scope)

  if (!before.includes(adminRoleIdStr)) {
    const merged = Array.from(new Set([...before, adminRoleIdStr]))
    await UserModel.updateOne({ _id: admin._id }, { $set: { roles: merged } })
    console.log('修复后 admin.roles =', JSON.stringify(merged))
  } else {
    console.log('admin 已绑定管理员角色，无需修复')
  }

  // 清权限缓存（permission.ts 的 5 分钟 TTL 缓存，否则旧 isAdmin=false 会持续命中）
  await invalidatePermissionCache()
  console.log('权限缓存已清空')

  console.log('\n=== 完成 ===')
  console.log('请重新登录 admin 账号（旧 JWT 里的 roles 仍是空的，必须重登获取新 token）')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('执行失败:', err)
  process.exit(1)
})

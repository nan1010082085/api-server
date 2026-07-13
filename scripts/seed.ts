/**
 * 数据库初始化脚本
 *
 * 只需运行一次，用于：
 * 1. 初始化默认租户
 * 2. 创建权限码
 * 3. 创建默认角色
 * 4. 创建默认管理员
 * 5. 创建默认菜单
 * 6. 创建默认微应用
 * 7. 创建 OAuth 客户端
 *
 * 运行方式：
 *   pnpm db:seed
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/database.js'
import { initDefaultTenant } from '../src/utils/initDefaultTenant.js'
import { seedPermissions } from '../src/utils/seedPermissions.js'
import { seedRoles } from '../src/utils/seedRoles.js'
import { seedAdmin } from '../src/utils/seedAdmin.js'
import { seedMicroApps } from '../src/utils/seedMicroApps.js'
import { seedMenus, migrateMenuFields } from '../src/utils/seedMenus.js'
import { seedClients } from '../src/utils/seedClients.js'
import { runBusinessSeeds } from '../src/utils/runBusinessSeeds.js'
import { ensureModelConfigs } from '../src/utils/seedModelConfigs.js'

async function main() {
  console.log('=== 数据库初始化 ===\n')
  console.log('连接数据库...')
  await connectDatabase()

  console.log('\n1. 初始化默认租户...')
  await initDefaultTenant()

  console.log('\n2. 创建权限码...')
  await seedPermissions()

  console.log('\n3. 创建默认角色...')
  await seedRoles()

  console.log('\n4. 创建默认管理员...')
  await seedAdmin()

  console.log('\n5. 创建默认菜单...')
  await seedMenus()
  await migrateMenuFields()

  console.log('\n6. 创建默认微应用...')
  await seedMicroApps()

  console.log('\n7. 创建 OAuth 客户端...')
  await seedClients()

  console.log('\n8. 业务 Schema / 流程 seed...')
  await runBusinessSeeds()

  console.log('\n9. 默认模型配置...')
  await ensureModelConfigs()

  console.log('\n=== 初始化完成 ===')
  console.log('默认管理员: admin / admin123456')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('初始化失败:', err)
  process.exit(1)
})

/**
 * 一次性脚本：清除硬编码 _id 的种子数据，重新插入
 *
 * 运行方式：
 *   npx tsx scripts/fix-seed-data.ts
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { MenuModel } from '../src/models/Menu.js'
import { MicroAppModel } from '../src/models/MicroApp.js'
import { ClientModel } from '../src/models/Client.js'
import { DEFAULT_TENANT_ID } from '../src/utils/initDefaultTenant.js'
import { connectDatabase } from '../src/config/database.js'

// 旧的硬编码 _id 列表
const OLD_MENU_IDS = [
  'a1b2c3d4-0000-4000-8000-000000000000',
  'a1b2c3d4-0001-4000-8000-000000000001',
  'a1b2c3d4-0002-4000-8000-000000000002',
  'a1b2c3d4-0003-4000-8000-000000000003',
  'a1b2c3d4-000b-4000-8000-00000000000b',
  'a1b2c3d4-000c-4000-8000-00000000000c',
  'a1b2c3d4-000d-4000-8000-00000000000d',
]

const OLD_SCHEMA_IDS = [
  'a1b2c3d4-0010-4000-8000-000000000010',
  'a1b2c3d4-0010-4000-8000-000000000011',
  'a1b2c3d4-0010-4000-8000-000000000013',
]

async function main() {
  console.log('连接数据库...')
  await connectDatabase()

  console.log('\n=== 清除硬编码 _id 的种子数据 ===\n')

  // 1. 删除旧的硬编码 _id 菜单
  const deletedMenus = await MenuModel.deleteMany({
    _id: { $in: OLD_MENU_IDS },
    tenantId: DEFAULT_TENANT_ID,
  })
  console.log(`删除菜单: ${deletedMenus.deletedCount} 条`)

  // 2. 删除旧的硬编码 schema 相关数据
  const deletedSchemas = await MenuModel.deleteMany({
    _id: { $in: OLD_SCHEMA_IDS },
  })
  console.log(`删除 Schema 相关: ${deletedSchemas.deletedCount} 条`)

  // 3. 清理可能存在的旧微应用数据
  const oldMicroApps = await MicroAppModel.find({
    _id: { $regex: /^a1b2c3d4/ },
    tenantId: DEFAULT_TENANT_ID,
  })
  if (oldMicroApps.length > 0) {
    await MicroAppModel.deleteMany({ _id: { $in: oldMicroApps.map(a => a._id) } })
    console.log(`删除微应用: ${oldMicroApps.length} 条`)
  }

  // 4. 清理旧的客户端数据
  const oldClients = await ClientModel.find({
    _id: { $regex: /^a1b2c3d4/ },
  })
  if (oldClients.length > 0) {
    await ClientModel.deleteMany({ _id: { $in: oldClients.map(c => c._id) } })
    console.log(`删除客户端: ${oldClients.length} 条`)
  }

  console.log('\n=== 完成 ===')
  console.log('现在重启服务，新的种子数据会自动生成（使用 MongoDB 自动生成的 _id）')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('执行失败:', err)
  process.exit(1)
})

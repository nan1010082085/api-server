import { MicroAppModel } from '../models/MicroApp.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

const DEFAULT_MICRO_APPS = [
  { name: 'editor', displayName: '表单设计器', activeRule: ['/standalone/editor', '/app/editor'], layout: 'with-menu', icon: 'EditPen', url: '/schema-platform/editor/', sort: 1 },
  { name: 'flow', displayName: '流程设计器', activeRule: ['/standalone/flow', '/app/flow'], layout: 'with-menu', icon: 'Connection', url: '/schema-platform/flow/', sort: 2 },
  { name: 'ai', displayName: 'AI 应用', activeRule: ['/standalone/ai', '/app/ai'], layout: 'with-menu', icon: 'ChatDotRound', url: '/schema-platform/ai/', sort: 3 },
]

/**
 * 种子微应用配置
 * 使用 upsert + $setOnInsert 保证幂等：仅在记录不存在时创建，不覆盖用户修改
 */
export async function seedMicroApps(): Promise<void> {
  let created = 0

  for (const app of DEFAULT_MICRO_APPS) {
    const result = await MicroAppModel.updateOne(
      { tenantId: DEFAULT_TENANT_ID, name: app.name },
      { $set: { ...app, tenantId: DEFAULT_TENANT_ID, status: 'active' } },
      { upsert: true },
    )
    if (result.upsertedCount > 0) created++
  }

  const skipped = DEFAULT_MICRO_APPS.length - created
  console.log(`[seed] Micro apps: ${created} created, ${skipped} already existed`)
}

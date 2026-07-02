import { NoticeModel } from '../models/Notice.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

export async function seedSampleNotices(): Promise<void> {
  const exists = await NoticeModel.findOne({ tenantId: DEFAULT_TENANT_ID, title: '欢迎使用 Schema 业务平台' })
  if (exists) return

  await NoticeModel.create({
    tenantId: DEFAULT_TENANT_ID,
    title: '欢迎使用 Schema 业务平台',
    content: 'Phase 1 MVP 已就绪：工作台、请假全流程、系统管理、能力平台运营入口。',
    status: 'published',
    publishAt: new Date(),
    createdBy: 'system',
  })
  console.log('[seed] Sample notice created')
}

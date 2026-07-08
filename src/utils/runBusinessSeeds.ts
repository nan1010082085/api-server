import { seedBuiltinFlowTemplates } from './seedFlowTemplates.js'
import { seedBusinessSchemas } from './seedBusinessSchemas.js'
import { seedMenus, migrateMenuFields } from './seedMenus.js'
import { seedSubmissionFlowBindings } from './seedWebhooks.js'
import { seedBusinessRoles, assignBusinessRolesToAdmin } from './seedBusinessRoles.js'
import { seedBusinessDicts } from './seedBusinessDicts.js'
import { seedBusinessAgentWorkflows } from './seedBusinessAgentWorkflows.js'
import { seedDemoWorkflows } from './seedDemoWorkflows.js'
import { seedSampleNotices } from './seedSampleNotices.js'
import { seedSampleAuditIssues, seedSampleMetrologyDevices } from './seedSampleDomainData.js'
import { seedDemoTenant } from './seedDemoTenant.js'
import { UserModel } from '../models/User.js'

/**
 * Business-platform seeds (flow templates, schemas, menu binding, webhooks).
 *
 * 只在新环境（数据库为空）时运行，已有数据则跳过。
 * 避免每次启动覆盖用户修改过的业务数据。
 */
export async function runBusinessSeeds(): Promise<void> {
  // 检查是否已有用户数据，有则跳过 seed
  const userCount = await UserModel.countDocuments()
  if (userCount > 0) {
    console.log('[seed] Database already has data, skipping business seeds')
    return
  }

  console.log('[seed] New environment detected, running business seeds...')

  await seedBuiltinFlowTemplates()
  await seedBusinessRoles()
  await assignBusinessRolesToAdmin()
  await seedBusinessDicts()
  await seedBusinessSchemas()
  await seedBusinessAgentWorkflows()
  await seedDemoWorkflows()
  await seedSampleNotices()
  await seedSampleAuditIssues()
  await seedSampleMetrologyDevices()
  await seedDemoTenant()
  await seedMenus()
  await migrateMenuFields()
  await seedSubmissionFlowBindings()
}

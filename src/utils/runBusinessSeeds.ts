import { seedBuiltinFlowTemplates } from './seedFlowTemplates.js'
import { seedBusinessSchemas } from './seedBusinessSchemas.js'
import { seedMenus, migrateMenuFields } from './seedMenus.js'
import { seedSubmissionFlowBindings } from './seedWebhooks.js'
import { seedBusinessRoles, assignBusinessRolesToAdmin } from './seedBusinessRoles.js'
import { seedBusinessDicts } from './seedBusinessDicts.js'
import { seedBusinessAgentWorkflows } from './seedBusinessAgentWorkflows.js'
import { seedSampleNotices } from './seedSampleNotices.js'
import { seedSampleAuditIssues, seedSampleMetrologyDevices } from './seedSampleDomainData.js'
import { seedDemoTenant } from './seedDemoTenant.js'

/**
 * Idempotent business-platform seeds (flow templates, schemas, menu binding, webhooks).
 * Safe to run on every server startup after DB connect.
 */
export async function runBusinessSeeds(): Promise<void> {
  await seedBuiltinFlowTemplates()
  await seedBusinessRoles()
  await assignBusinessRolesToAdmin()
  await seedBusinessDicts()
  await seedBusinessSchemas()
  await seedBusinessAgentWorkflows()
  await seedSampleNotices()
  await seedSampleAuditIssues()
  await seedSampleMetrologyDevices()
  await seedDemoTenant()
  await seedMenus()
  await migrateMenuFields()
  await seedSubmissionFlowBindings()
}

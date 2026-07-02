import { seedBuiltinFlowTemplates } from './seedFlowTemplates.js'
import { seedBusinessSchemas } from './seedBusinessSchemas.js'
import { seedMenus, migrateMenuFields } from './seedMenus.js'
import { seedSubmissionFlowBindings } from './seedWebhooks.js'
import { seedBusinessRoles, assignBusinessRolesToAdmin } from './seedBusinessRoles.js'

/**
 * Idempotent business-platform seeds (flow templates, schemas, menu binding, webhooks).
 * Safe to run on every server startup after DB connect.
 */
export async function runBusinessSeeds(): Promise<void> {
  await seedBuiltinFlowTemplates()
  await seedBusinessRoles()
  await assignBusinessRolesToAdmin()
  await seedBusinessSchemas()
  await seedMenus()
  await migrateMenuFields()
  await seedSubmissionFlowBindings()
}

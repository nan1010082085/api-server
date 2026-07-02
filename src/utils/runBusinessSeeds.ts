import { seedBuiltinFlowTemplates } from './seedFlowTemplates.js'
import { seedBusinessSchemas } from './seedBusinessSchemas.js'
import { seedMenus, migrateMenuFields } from './seedMenus.js'

/**
 * Idempotent business-platform seeds (flow templates, schemas, menu binding).
 * Safe to run on every server startup after DB connect.
 */
export async function runBusinessSeeds(): Promise<void> {
  await seedBuiltinFlowTemplates()
  await seedBusinessSchemas()
  await seedMenus()
  await migrateMenuFields()
}

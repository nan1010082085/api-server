import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/database.js'
import { seedBusinessSchemas } from '../src/utils/seedBusinessSchemas.js'
import { repairSchemaMenuPaths, bindMenuSchemaIds } from '../src/utils/seedMenus.js'

async function main() {
  await connectDatabase()
  await seedBusinessSchemas()
  await repairSchemaMenuPaths()
  await bindMenuSchemaIds()
  console.log('[sync] HR deliverables + menus updated')
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

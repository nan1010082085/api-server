import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase } from '../src/config/database.js'
import { MenuModel } from '../src/models/Menu.js'
import { repairSchemaMenuPaths } from '../src/utils/seedMenus.js'

async function main() {
  await connectDatabase()
  await repairSchemaMenuPaths()

  const legacy = await MenuModel.countDocuments({ path: '/app/editor/view', routeType: 'schema' })
  const unique = await MenuModel.countDocuments({ path: /^\/app\/editor\/view\//, routeType: 'schema' })
  const leave = await MenuModel.find({ name: { $in: ['请假申请', '请假台账'] } }).select('name path routeType')

  console.log('legacy path count:', legacy)
  console.log('unique path count:', unique)
  for (const m of leave) {
    console.log(` ${m.name} => ${m.path}`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

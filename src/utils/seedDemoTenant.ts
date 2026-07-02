import { TenantModel } from '../models/Tenant.js'

export async function seedDemoTenant(): Promise<void> {
  const exists = await TenantModel.findOne({ code: 'demo' })
  if (exists) return

  await TenantModel.create({
    name: '演示租户',
    code: 'demo',
    status: 'active',
    config: {
      maxUsers: 100,
      features: ['workbench', 'hr-leave', 'oa'],
    },
  })
  console.log('[seed] Demo tenant created (code: demo)')
}

import { AuditIssueModel } from '../models/AuditIssue.js'
import { MetrologyDeviceModel } from '../models/MetrologyDevice.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

export async function seedSampleAuditIssues(): Promise<void> {
  const exists = await AuditIssueModel.findOne({ tenantId: DEFAULT_TENANT_ID, title: '费用报销单据不完整' })
  if (exists) return
  await AuditIssueModel.create({
    tenantId: DEFAULT_TENANT_ID,
    title: '费用报销单据不完整',
    description: '部分报销单缺少发票原件扫描件',
    status: 'open',
    severity: 'medium',
    createdBy: 'system',
  })
  console.log('[seed] Sample audit issue created')
}

export async function seedSampleMetrologyDevices(): Promise<void> {
  const exists = await MetrologyDeviceModel.findOne({ tenantId: DEFAULT_TENANT_ID, code: 'EQ-001' })
  if (exists) return
  const soon = new Date()
  soon.setDate(soon.getDate() + 15)
  await MetrologyDeviceModel.create([
    {
      tenantId: DEFAULT_TENANT_ID,
      name: '数字压力表',
      code: 'EQ-001',
      category: 'pressure',
      calibrationDueAt: soon,
      status: 'expiring',
      location: '实验室 A',
    },
    {
      tenantId: DEFAULT_TENANT_ID,
      name: '标准温度计',
      code: 'EQ-002',
      category: 'temperature',
      calibrationDueAt: new Date(Date.now() + 180 * 86400000),
      status: 'valid',
      location: '实验室 B',
    },
  ])
  console.log('[seed] Sample metrology devices created')
}

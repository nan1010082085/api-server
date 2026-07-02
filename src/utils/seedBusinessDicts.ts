import { DictTypeModel } from '../models/DictType.js'
import { DictDataModel } from '../models/DictData.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import { LEAVE_TYPE_LABELS } from '../services/business/leaveTypeLabels.js'

interface DictSeedSpec {
  code: string
  name: string
  items: Array<{ label: string; value: string; sort: number }>
}

const BUSINESS_DICTS: DictSeedSpec[] = [
  {
    code: 'leave_type',
    name: '请假类型',
    items: Object.entries(LEAVE_TYPE_LABELS).map(([value, label], index) => ({
      label,
      value,
      sort: index + 1,
    })),
  },
  {
    code: 'expense_type',
    name: '报销类型',
    items: [
      { label: '差旅', value: 'travel', sort: 1 },
      { label: '办公', value: 'office', sort: 2 },
      { label: '招待', value: 'entertainment', sort: 3 },
    ],
  },
  {
    code: 'audit_status',
    name: '审计问题状态',
    items: [
      { label: '待整改', value: 'open', sort: 1 },
      { label: '整改中', value: 'in_progress', sort: 2 },
      { label: '已验收', value: 'closed', sort: 3 },
    ],
  },
  {
    code: 'notice_status',
    name: '公告状态',
    items: [
      { label: '草稿', value: 'draft', sort: 1 },
      { label: '已发布', value: 'published', sort: 2 },
    ],
  },
  {
    code: 'notice_type',
    name: '公告类型',
    items: [
      { label: '通知', value: 'notice', sort: 1 },
      { label: '公告', value: 'announcement', sort: 2 },
      { label: '紧急', value: 'urgent', sort: 3 },
    ],
  },
  {
    code: 'trip_type',
    name: '出差类型',
    items: [
      { label: '国内', value: 'domestic', sort: 1 },
      { label: '国际', value: 'international', sort: 2 },
    ],
  },
  {
    code: 'purchase_type',
    name: '采购类型',
    items: [
      { label: '办公用品', value: 'office', sort: 1 },
      { label: '设备', value: 'equipment', sort: 2 },
    ],
  },
  {
    code: 'gov_case_type',
    name: '政务事项类型',
    items: [
      { label: '行政许可', value: 'license', sort: 1 },
      { label: '公共服务', value: 'service', sort: 2 },
    ],
  },
  {
    code: 'calibration_status',
    name: '检定状态',
    items: [
      { label: '有效', value: 'valid', sort: 1 },
      { label: '即将到期', value: 'expiring', sort: 2 },
      { label: '已过期', value: 'expired', sort: 3 },
    ],
  },
]

export async function seedBusinessDicts(): Promise<void> {
  for (const spec of BUSINESS_DICTS) {
    let dictType = await DictTypeModel.findOne({ code: spec.code, tenantId: DEFAULT_TENANT_ID })
    if (!dictType) {
      dictType = await DictTypeModel.create({
        tenantId: DEFAULT_TENANT_ID,
        code: spec.code,
        name: spec.name,
        status: 'active',
        remark: '业务平台 seed',
      })
      console.log(`[seed] Dict type created: ${spec.code}`)
    }

    for (const item of spec.items) {
      const exists = await DictDataModel.findOne({
        dictTypeId: dictType._id,
        value: item.value,
      })
      if (!exists) {
        await DictDataModel.create({
          tenantId: DEFAULT_TENANT_ID,
          dictTypeId: dictType._id,
          label: item.label,
          value: item.value,
          sort: item.sort,
          status: 'active',
        })
      }
    }
  }
}

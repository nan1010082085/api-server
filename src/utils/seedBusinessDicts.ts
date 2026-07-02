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

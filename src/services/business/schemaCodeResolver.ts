import { FormSchemaModel } from '../../models/FormSchema.js'
import { DEFAULT_TENANT_ID } from '../../utils/initDefaultTenant.js'
import { leanDoc } from '../../utils/leanDoc.js'

/** 按业务 Schema code 解析 FormSchema._id */
export async function resolveFormSchemaIdByCode(code: string): Promise<string | null> {
  const doc = leanDoc<{ _id?: unknown }>(
    await FormSchemaModel.findOne({ tenantId: DEFAULT_TENANT_ID, code }).select('_id').lean(),
  )
  return doc?._id ? String(doc._id) : null
}

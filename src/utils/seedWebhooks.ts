import { SubmissionFlowBindingModel } from '../models/SubmissionFlowBinding.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

export interface ApplyFlowBindingSpec {
  name: string
  schemaCode: string
  flowName: string
  fieldMapping?: Record<string, string>
}

async function resolveBindingIds(schemaCode: string, flowName: string) {
  const schema = await FormSchemaModel.findOne({ tenantId: DEFAULT_TENANT_ID, code: schemaCode })
  const flow = await FlowDefinitionModel.findOne({
    tenantId: DEFAULT_TENANT_ID,
    name: flowName,
    status: 'published',
  })
  if (!schema || !flow) return null
  return { schemaId: String(schema._id), flowDefinitionId: String(flow._id) }
}

/**
 * Seed submission.created → flow bindings (S-03).
 */
export async function seedApplyFlowBindings(specs: ApplyFlowBindingSpec[]): Promise<void> {
  for (const spec of specs) {
    const ids = await resolveBindingIds(spec.schemaCode, spec.flowName)
    if (!ids) {
      console.warn(`[seed] Skip flow binding "${spec.name}" — schema or flow not ready`)
      continue
    }

    await SubmissionFlowBindingModel.updateOne(
      { tenantId: DEFAULT_TENANT_ID, name: spec.name },
      {
        $set: {
          event: 'submission.created',
          schemaId: ids.schemaId,
          flowDefinitionId: ids.flowDefinitionId,
          enabled: true,
          fieldMapping: spec.fieldMapping ?? {},
        },
        $setOnInsert: { tenantId: DEFAULT_TENANT_ID, name: spec.name },
      },
      { upsert: true },
    )
    console.log(`[seed] Submission flow binding: ${spec.name}`)
  }
}

/** Backward-compatible entry */
export async function seedSubmissionFlowBindings(): Promise<void> {
  await seedApplyFlowBindings([
    {
      name: '请假申请启动流程',
      schemaCode: 'hr-leave-apply',
      flowName: '请假审批',
      fieldMapping: { days: 'days', leaveType: 'leaveType' },
    },
    {
      name: '出差申请启动流程',
      schemaCode: 'oa-trip-apply',
      flowName: '出差审批',
      fieldMapping: { title: 'title', reason: 'reason' },
    },
    {
      name: '报销申请启动流程',
      schemaCode: 'fin-expense-apply',
      flowName: '报销审批',
      fieldMapping: { totalAmount: 'totalAmount', title: 'title' },
    },
    {
      name: '采购申请启动流程',
      schemaCode: 'fin-purchase-apply',
      flowName: '采购审批',
      fieldMapping: { totalAmount: 'totalAmount', title: 'title' },
    },
    {
      name: '加班申请启动流程',
      schemaCode: 'hr-overtime-apply',
      flowName: '加班审批',
      fieldMapping: { title: 'title', reason: 'reason' },
    },
    {
      name: '政务事项启动流程',
      schemaCode: 'gov-case-apply',
      flowName: '政务并联审批',
      fieldMapping: { title: 'title' },
    },
  ])
}

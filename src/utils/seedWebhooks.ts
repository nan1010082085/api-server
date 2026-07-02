import { SubmissionFlowBindingModel } from '../models/SubmissionFlowBinding.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import {
  ASSET_FLOW_NAME,
  DOC_FLOW_NAME,
  EXPENSE_FLOW_NAME,
  GOV_PARALLEL_FLOW_NAME,
  LEAVE_FLOW_NAME,
  ONBOARD_FLOW_NAME,
  OVERTIME_FLOW_NAME,
  PURCHASE_FLOW_NAME,
  RECRUIT_FLOW_NAME,
  RECRUIT_OFFER_FLOW_NAME,
  RESIGN_FLOW_NAME,
  SEAL_FLOW_NAME,
  TRIP_FLOW_NAME,
} from './builtinFlowGraphs.js'

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

/** S-03 submission.created → flow bindings */
export const APPLY_FLOW_BINDING_SPECS: ApplyFlowBindingSpec[] = [
  {
    name: '请假申请启动流程',
    schemaCode: 'hr-leave-apply',
    flowName: LEAVE_FLOW_NAME,
    fieldMapping: { days: 'days', leaveType: 'leaveType' },
  },
  {
    name: '出差申请启动流程',
    schemaCode: 'oa-trip-apply',
    flowName: TRIP_FLOW_NAME,
    fieldMapping: { title: 'title', reason: 'reason' },
  },
  {
    name: '报销申请启动流程',
    schemaCode: 'fin-expense-apply',
    flowName: EXPENSE_FLOW_NAME,
    fieldMapping: { totalAmount: 'totalAmount', title: 'title' },
  },
  {
    name: '采购申请启动流程',
    schemaCode: 'fin-purchase-apply',
    flowName: PURCHASE_FLOW_NAME,
    fieldMapping: { totalAmount: 'totalAmount', title: 'title' },
  },
  {
    name: '加班申请启动流程',
    schemaCode: 'hr-overtime-apply',
    flowName: OVERTIME_FLOW_NAME,
    fieldMapping: { title: 'title', reason: 'reason' },
  },
  {
    name: '政务事项启动流程',
    schemaCode: 'gov-case-apply',
    flowName: GOV_PARALLEL_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '政务受理启动流程',
    schemaCode: 'gov-case-accept',
    flowName: GOV_PARALLEL_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '证照申请启动流程',
    schemaCode: 'gov-license-apply',
    flowName: GOV_PARALLEL_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '用印申请启动流程',
    schemaCode: 'oa-seal-apply',
    flowName: SEAL_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '资产领用启动流程',
    schemaCode: 'oa-asset-apply',
    flowName: ASSET_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '入职办理启动流程',
    schemaCode: 'hr-onboard-apply',
    flowName: ONBOARD_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '离职办理启动流程',
    schemaCode: 'hr-resign-apply',
    flowName: RESIGN_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '招聘需求启动流程',
    schemaCode: 'hr-recruit-apply',
    flowName: RECRUIT_FLOW_NAME,
    fieldMapping: { title: 'title', headcount: 'headcount' },
  },
  {
    name: 'Offer审批启动流程',
    schemaCode: 'hr-recruit-offer',
    flowName: RECRUIT_OFFER_FLOW_NAME,
    fieldMapping: { title: 'title', salary: 'salary' },
  },
  {
    name: '公文收文启动流程',
    schemaCode: 'oa-doc-receive',
    flowName: DOC_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
  {
    name: '公文拟稿启动流程',
    schemaCode: 'oa-doc-draft',
    flowName: DOC_FLOW_NAME,
    fieldMapping: { title: 'title' },
  },
]

/** Backward-compatible entry */
export async function seedSubmissionFlowBindings(): Promise<void> {
  await seedApplyFlowBindings(APPLY_FLOW_BINDING_SPECS)
}

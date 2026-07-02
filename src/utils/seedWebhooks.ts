import { SubmissionFlowBindingModel } from '../models/SubmissionFlowBinding.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import { LEAVE_FLOW_DEFINITION_NAME } from './businessSchemaStubs.js'

const LEAVE_BINDING_NAME = '请假申请启动流程'

/**
 * Seed standard submission.created → flow bindings (S-03).
 */
export async function seedSubmissionFlowBindings(): Promise<void> {
  const leaveSchema = await FormSchemaModel.findOne({ tenantId: DEFAULT_TENANT_ID, code: 'hr-leave-apply' })
  const leaveFlow = await FlowDefinitionModel.findOne({
    tenantId: DEFAULT_TENANT_ID,
    name: LEAVE_FLOW_DEFINITION_NAME,
    status: 'published',
  })

  if (!leaveSchema || !leaveFlow) {
    console.warn('[seed] Skip submission flow binding — leave schema or flow not ready')
    return
  }

  const schemaId = String(leaveSchema._id)
  const flowDefinitionId = String(leaveFlow._id)

  const result = await SubmissionFlowBindingModel.updateOne(
    { tenantId: DEFAULT_TENANT_ID, name: LEAVE_BINDING_NAME },
    {
      $set: {
        event: 'submission.created',
        schemaId,
        flowDefinitionId,
        enabled: true,
        fieldMapping: {
          days: 'days',
          leaveType: 'leaveType',
        },
      },
      $setOnInsert: {
        tenantId: DEFAULT_TENANT_ID,
        name: LEAVE_BINDING_NAME,
      },
    },
    { upsert: true },
  )

  if (result.upsertedCount > 0) {
    console.log(`[seed] Submission flow binding created: ${LEAVE_BINDING_NAME}`)
  } else {
    console.log(`[seed] Submission flow binding updated: ${LEAVE_BINDING_NAME}`)
  }
}

import { eventBus } from './eventBus.js'
import { SubmissionFlowBindingModel } from '../models/SubmissionFlowBinding.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { flowEngine } from '../flow-services/FlowEngine.js'

interface SubmissionCreatedPayload {
  submissionId: string
  schemaId: string
  submitterId?: string
  data: Record<string, unknown>
}

function mapSubmissionVariables(
  data: Record<string, unknown>,
  fieldMapping: Record<string, string>,
): Record<string, unknown> {
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
    return { ...data }
  }

  const variables: Record<string, unknown> = {}
  for (const [formField, flowVar] of Object.entries(fieldMapping)) {
    if (formField in data) {
      variables[flowVar] = data[formField]
    }
  }
  return variables
}

async function handleSubmissionCreated(payload: SubmissionCreatedPayload): Promise<void> {
  const bindings = await SubmissionFlowBindingModel.find({
    event: 'submission.created',
    schemaId: payload.schemaId,
    enabled: true,
  }).lean()

  if (bindings.length === 0) return

  for (const binding of bindings) {
    try {
      const variables = mapSubmissionVariables(payload.data, binding.fieldMapping ?? {})
      variables.submissionId = payload.submissionId
      variables._triggerSource = 'submission.created'

      const instance = await flowEngine.startFlow(
        binding.flowDefinitionId,
        variables,
        payload.submitterId ?? 'system',
      )

      const instanceId = String((instance as { _id: string })._id)
      await FormSubmissionModel.findByIdAndUpdate(payload.submissionId, {
        $set: { flowInstanceId: instanceId },
      })

      console.log(
        `[submissionFlow] Started flow ${binding.flowDefinitionId} for submission ${payload.submissionId}`,
      )
    } catch (err) {
      console.error(
        `[submissionFlow] Failed binding "${binding.name}" for submission ${payload.submissionId}:`,
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}

let initialized = false

export function initSubmissionFlowBridge(): void {
  if (initialized) return

  eventBus.on('submission.created', (raw: unknown) => {
    const payload = raw as SubmissionCreatedPayload
    if (!payload?.submissionId || !payload?.schemaId) return

    handleSubmissionCreated(payload).catch((err) => {
      console.error('[submissionFlow] Unhandled error:', err instanceof Error ? err.message : String(err))
    })
  })

  initialized = true
  console.log('[submissionFlow] Bridge initialized for submission.created → flow')
}

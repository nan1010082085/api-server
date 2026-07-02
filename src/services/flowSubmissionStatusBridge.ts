import { eventBus } from './eventBus.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import type { SubmissionStatus } from '../models/FormSubmission.js'

interface FlowLifecyclePayload {
  instanceId: string
  definitionId?: string
}

async function syncSubmissionStatus(instanceId: string, status: SubmissionStatus): Promise<void> {
  const result = await FormSubmissionModel.updateOne(
    { flowInstanceId: instanceId, status: { $ne: status } },
    { $set: { status } },
  )
  if (result.modifiedCount > 0) {
    console.log(`[flowSubmission] Updated submission status → ${status} for instance ${instanceId}`)
  }
}

async function handleFlowCompleted(raw: unknown): Promise<void> {
  const payload = raw as FlowLifecyclePayload
  if (!payload?.instanceId) return
  await syncSubmissionStatus(payload.instanceId, 'approved')
}

async function handleFlowRejected(raw: unknown): Promise<void> {
  const payload = raw as FlowLifecyclePayload
  if (!payload?.instanceId) return
  await syncSubmissionStatus(payload.instanceId, 'rejected')
}

let initialized = false

export function initFlowSubmissionStatusBridge(): void {
  if (initialized) return

  eventBus.on('flow.completed', (raw) => handleFlowCompleted(raw))
  eventBus.on('flow.rejected', (raw) => handleFlowRejected(raw))

  initialized = true
  console.log('[flowSubmission] Bridge initialized for flow lifecycle → submission status')
}

export { handleFlowCompleted, handleFlowRejected, syncSubmissionStatus }

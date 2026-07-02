/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleFlowCompleted, handleFlowRejected } from '../flowSubmissionStatusBridge.js'

vi.mock('../../models/FormSubmission.js', () => ({
  FormSubmissionModel: {
    updateOne: vi.fn(),
  },
}))

import { FormSubmissionModel } from '../../models/FormSubmission.js'

describe('flowSubmissionStatusBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(FormSubmissionModel.updateOne).mockResolvedValue({ modifiedCount: 1 } as never)
  })

  it('updates submission to approved on flow.completed', async () => {
    await handleFlowCompleted({ instanceId: 'inst-1', definitionId: 'def-1' })

    expect(FormSubmissionModel.updateOne).toHaveBeenCalledWith(
      { flowInstanceId: 'inst-1', status: { $ne: 'approved' } },
      { $set: { status: 'approved' } },
    )
  })

  it('updates submission to rejected on flow.rejected', async () => {
    await handleFlowRejected({ instanceId: 'inst-2', definitionId: 'def-1' })

    expect(FormSubmissionModel.updateOne).toHaveBeenCalledWith(
      { flowInstanceId: 'inst-2', status: { $ne: 'rejected' } },
      { $set: { status: 'rejected' } },
    )
  })
})

/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findOne = vi.fn()
const create = vi.fn()

vi.mock('../models/openWorkflowIdempotency.js', () => ({
  OpenWorkflowIdempotencyModel: {
    findOne: (...args: unknown[]) => findOne(...args),
    create: (...args: unknown[]) => create(...args),
  },
}))

import {
  hashOpenExecuteRequest,
  findIdempotentOpenResponse,
} from '../services/openWorkflowIdempotency.js'
import { OpenWorkflowError } from '../services/agentWorkflowOpenService.js'

const auth = {
  tenantId: '000000',
  userId: 'user1',
  source: 'apiKey' as const,
  keyId: 'key1',
  permissions: ['workflow:execute'],
}

describe('openWorkflowIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashOpenExecuteRequest is stable for same payload', () => {
    const a = hashOpenExecuteRequest({ slug: 'demo' }, { message: 'hi' })
    const b = hashOpenExecuteRequest({ slug: 'demo' }, { message: 'hi' })
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('findIdempotentOpenResponse returns cached response', async () => {
    findOne.mockReturnValue({
      lean: async () => ({
        requestHash: hashOpenExecuteRequest({ slug: 'demo' }, { x: 1 }),
        response: { success: true, data: { executionId: 'exec1' } },
      }),
    })

    const hash = hashOpenExecuteRequest({ slug: 'demo' }, { x: 1 })
    const cached = await findIdempotentOpenResponse(auth, 'req-1', hash)
    expect(cached).toEqual({ success: true, data: { executionId: 'exec1' } })
  })

  it('findIdempotentOpenResponse throws on payload mismatch', async () => {
    findOne.mockReturnValue({
      lean: async () => ({
        requestHash: 'other-hash',
        response: { success: true },
      }),
    })

    await expect(
      findIdempotentOpenResponse(auth, 'req-1', hashOpenExecuteRequest({ slug: 'demo' }, { x: 1 })),
    ).rejects.toBeInstanceOf(OpenWorkflowError)
  })
})

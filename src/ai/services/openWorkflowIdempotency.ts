/**
 * Open Workflow 执行幂等键 — 按 API Key + Idempotency-Key 去重，24h TTL。
 */

import crypto from 'crypto'
import type { ApiKeyAuthState } from '../../middleware/apiKeyAuth.js'
import { OpenWorkflowIdempotencyModel } from '../models/openWorkflowIdempotency.js'
import { OpenWorkflowError } from './agentWorkflowOpenService.js'

const TTL_MS = 24 * 60 * 60 * 1000

export function hashOpenExecuteRequest(
  lookup: { workflowId?: string; slug?: string },
  input: Record<string, unknown>,
): string {
  const payload = JSON.stringify({
    workflowId: lookup.workflowId ?? null,
    slug: lookup.slug ?? null,
    input,
  })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function findIdempotentOpenResponse(
  auth: ApiKeyAuthState,
  idempotencyKey: string,
  requestHash: string,
): Promise<unknown | null> {
  const doc = await OpenWorkflowIdempotencyModel.findOne({
    tenantId: auth.tenantId,
    keyId: String(auth.keyId),
    idempotencyKey,
  }).lean()

  if (!doc) return null

  const record = doc as unknown as { requestHash: string; response: unknown }
  if (record.requestHash !== requestHash) {
    throw new OpenWorkflowError(
      'Idempotency-Key reused with a different request payload',
      'idempotency_conflict',
      409,
    )
  }
  return record.response
}

export async function storeIdempotentOpenResponse(
  auth: ApiKeyAuthState,
  idempotencyKey: string,
  requestHash: string,
  executionId: string,
  response: unknown,
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS)
  try {
    await OpenWorkflowIdempotencyModel.create({
      tenantId: auth.tenantId,
      keyId: String(auth.keyId),
      idempotencyKey,
      requestHash,
      executionId,
      response,
      expiresAt,
    })
  } catch (err) {
    const isDuplicate =
      err instanceof Error &&
      'code' in err &&
      (err as { code?: number }).code === 11000
    if (!isDuplicate) throw err

    const existing = await findIdempotentOpenResponse(auth, idempotencyKey, requestHash)
    if (!existing) {
      throw new OpenWorkflowError(
        'Idempotency-Key reused with a different request payload',
        'idempotency_conflict',
        409,
      )
    }
  }
}

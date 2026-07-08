/**
 * 工作流统一调用 — 入口 URL + Workflow Key / API Key
 *
 * 内外部执行共用 startAgentWorkflowExecution；鉴权支持 workflow.invokeKey 或平台 API Key（sk-*）。
 * 平台内 JWT execute 仅证明「所有者」，不再是一套独立执行逻辑。
 */

import { timingSafeEqual, createHmac, randomBytes } from 'node:crypto'
import { getCurrentTenantId } from '../../middleware/tenantContext.js'
import type { Context } from 'koa'
import { isValidObjectId } from '../../utils/objectId.js'
import { AgentWorkflowModel } from '../models/agentWorkflow.js'
import { ApiKeyModel } from '../../models/ApiKey.js'
import { startAgentWorkflowExecution } from './agentWorkflowService.js'
import { logger } from '../../utils/logger.js'

export const WORKFLOW_KEY_HEADER = 'X-Workflow-Key'
export const API_KEY_HEADER = 'X-API-Key'

export function generateInvokeKey(): string {
  return `wf_${randomBytes(24).toString('hex')}`
}

export function maskInvokeKey(key: string): string {
  if (key.length <= 12) return `${key.slice(0, 4)}****`
  return `${key.slice(0, 8)}****${key.slice(-4)}`
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Constant-time compare against self to avoid length oracle
    timingSafeEqual(bufB, bufB)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export function verifyWorkflowInvokeKey(
  expected: string | null | undefined,
  provided: string | undefined,
): boolean {
  const exp = expected?.trim()
  const got = provided?.trim()
  if (!exp || !got) return false
  return safeEqual(exp, got)
}

export async function findPublishedWorkflowForInvoke(
  slugOrId: string,
  tenantId?: string,
) {
  const trimmed = slugOrId.trim()
  const tenant = tenantId?.trim() || '000000'
  const slugLower = trimmed.toLowerCase()

  if (isValidObjectId(trimmed)) {
    return AgentWorkflowModel.findOne({
      _id: trimmed,
      tenantId: tenant,
      status: 'published',
      publishedGraph: { $exists: true, $ne: null },
    }).select('+invokeKey')
  }

  return AgentWorkflowModel.findOne({
    tenantId: tenant,
    slug: slugLower,
    status: 'published',
    publishedGraph: { $exists: true, $ne: null },
  }).select('+invokeKey')
}

export type WorkflowInvokeTrigger = 'manual' | 'webhook' | 'chat' | 'api'

export interface InvokeWorkflowOptions {
  slugOrId: string
  invokeKey?: string
  /** X-API-Key (sk-* prefix), alternative to invokeKey */
  apiKey?: string
  input?: Record<string, unknown>
  trigger?: WorkflowInvokeTrigger
  /** 平台内：JWT 用户 id，验证为 workflow 所有者时可免传 invokeKey */
  ownerUserId?: string
  tenantId?: string
  callbackUrl?: string
  callbackSecret?: string
}

export class WorkflowInvokeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'WorkflowInvokeError'
  }
}

export async function invokePublishedWorkflow(opts: InvokeWorkflowOptions) {
  const workflow = await findPublishedWorkflowForInvoke(opts.slugOrId, opts.tenantId)
  if (!workflow) {
    throw new WorkflowInvokeError('Workflow not found or not published', 'workflow_not_found', 404)
  }

  const isOwner = Boolean(
    opts.ownerUserId && workflow.createdBy === opts.ownerUserId,
  )

  if (!isOwner) {
    // Try X-Workflow-Key first
    const workflowKeyValid = verifyWorkflowInvokeKey(workflow.invokeKey, opts.invokeKey)

    if (!workflowKeyValid) {
      // Fallback: try X-API-Key (sk-*)
      const tenant = opts.tenantId?.trim() || '000000'
      const apiRecord = await verifyApiKeyLookup(opts.apiKey, tenant)
      if (!apiRecord) {
        throw new WorkflowInvokeError(
          'Invalid or missing key. Provide X-Workflow-Key or X-API-Key.',
          'invalid_workflow_key',
          401,
        )
      }
    }
  }

  const execution = await startAgentWorkflowExecution(
    String(workflow._id),
    workflow.createdBy,
    opts.input ?? {},
    {
      trigger: opts.trigger ?? 'api',
      callbackUrl: opts.callbackUrl,
      callbackSecret: opts.callbackSecret,
    },
  )

  if (!execution) {
    throw new WorkflowInvokeError('Failed to start workflow', 'invoke_failed', 500)
  }

  return { workflow, execution }
}

/** Webhook 路径触发：验签 secret 与 workflow.invokeKey 对齐 */
export function verifyWebhookSignatureWithInvokeKey(
  invokeKey: string | undefined,
  signatureHeader: string | undefined,
  payload: string,
): boolean {
  const key = invokeKey?.trim()
  if (!key) return false
  if (!signatureHeader?.trim()) {
    return false
  }
  const expected = `sha256=${createHmac('sha256', key).update(payload).digest('hex')}`
  return safeEqual(expected, signatureHeader.trim())
}

/**
 * Lookup an sk-* API key in ApiKeyModel and validate status/expiration.
 * Returns the ApiKey record if valid, null otherwise.
 */
export async function verifyApiKeyLookup(
  apiKey: string | undefined,
  tenantId?: string,
): Promise<{ tenantId: string; createdBy: string } | null> {
  const key = apiKey?.trim()
  if (!key) return null

  const record = await ApiKeyModel.findOne({ key })
  if (!record) return null

  if (record.status !== 'active') return null

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null

  // When tenantId is provided, enforce same-tenant constraint
  if (tenantId && record.tenantId !== tenantId) return null

  // Async update lastUsedAt, non-blocking
  ApiKeyModel.updateOne({ _id: record._id }, { lastUsedAt: new Date() })
    .exec()
    .catch((err: unknown) => logger.warn({ msg: '[verifyApiKeyLookup] lastUsedAt update failed', err }))

  return { tenantId: record.tenantId, createdBy: record.createdBy }
}

export function readWorkflowKeyFromContext(ctx: Context): string | undefined {
  return ctx.get(WORKFLOW_KEY_HEADER) || undefined
}

export function readApiKeyFromContext(ctx: Context): string | undefined {
  return ctx.get(API_KEY_HEADER) || undefined
}

export function resolveInvokeTenantId(ctx: Context): string {
  return getCurrentTenantId(ctx) ?? '000000'
}

export function buildWorkflowInvokeUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/api/ai/workflows/invoke/${encodeURIComponent(slug)}`
}

export function logInvokeAttempt(slugOrId: string, ok: boolean, trigger: string): void {
  logger.info({
    msg: '[workflowInvoke]',
    slugOrId,
    ok,
    trigger,
  })
}

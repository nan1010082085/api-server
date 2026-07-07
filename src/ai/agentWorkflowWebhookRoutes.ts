/**
 * Agent 工作流 Webhook 触发入口
 *
 * POST/GET /api/ai/webhooks/*path
 *
 * 鉴权（任一通过即可）：
 * - X-Workflow-Key：与 workflow.invokeKey 一致（统一调用模型）
 * - X-Webhook-Signature: sha256=<hex>：节点 webhookSecret 或 workflow.invokeKey 的 HMAC
 * 开发环境可设 AI_WEBHOOK_SKIP_HMAC=true 跳过 HMAC 验签（仍需 Key 或跳过全部）。
 */

import Router from '@koa/router'
import {
  findPublishedWorkflowByWebhook,
  startAgentWorkflowExecution,
} from './services/agentWorkflowService.js'
import {
  normalizeWebhookPath,
  buildWebhookSignaturePayload,
  verifyWebhookHmac,
  shouldSkipWebhookHmac,
} from './services/agentWorkflowWebhookUtils.js'
import {
  verifyWorkflowInvokeKey,
  verifyWebhookSignatureWithInvokeKey,
  readWorkflowKeyFromContext,
  WORKFLOW_KEY_HEADER,
} from './services/agentWorkflowInvoke.js'
import { logger } from '../utils/logger.js'

const router = new Router({ prefix: '/api/ai/webhooks' })

function isWebhookAuthorized(
  match: { webhookSecret?: string; invokeKey?: string },
  ctx: { get: (name: string) => string },
  payload: string,
): boolean {
  const workflowKey = readWorkflowKeyFromContext(ctx as Parameters<typeof readWorkflowKeyFromContext>[0])
  if (verifyWorkflowInvokeKey(match.invokeKey, workflowKey)) {
    return true
  }

  if (shouldSkipWebhookHmac()) {
    return true
  }

  const signatureHeader = ctx.get('X-Webhook-Signature')
  const nodeSecret = match.webhookSecret?.trim()

  if (nodeSecret && verifyWebhookHmac(nodeSecret, signatureHeader, payload)) {
    return true
  }

  if (match.invokeKey && verifyWebhookSignatureWithInvokeKey(match.invokeKey, signatureHeader, payload)) {
    return true
  }

  return false
}

async function handleWebhook(ctx: {
  method: string
  params: { path?: string }
  get: (name: string) => string
  request: { body?: unknown; query?: Record<string, unknown> }
  status: number
  body: unknown
}) {
  const rawPath = ctx.params.path ?? ''
  const webhookPath = normalizeWebhookPath(`/${rawPath}`)
  const httpMethod = ctx.method.toUpperCase()

  const match = await findPublishedWorkflowByWebhook(webhookPath, httpMethod)
  if (!match) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Webhook not found' } }
    return
  }

  const payload = buildWebhookSignaturePayload(
    httpMethod,
    ctx.request.body,
    ctx.request.query ?? {},
  )

  if (!isWebhookAuthorized(match, ctx, payload)) {
    ctx.status = 401
    ctx.body = {
      success: false,
      error: {
        message: `Invalid auth: set ${WORKFLOW_KEY_HEADER} or X-Webhook-Signature`,
        code: 'invalid_webhook_auth',
      },
    }
    return
  }

  const input: Record<string, unknown> = {
    method: ctx.method,
    path: webhookPath,
    query: ctx.request.query ?? {},
    body: ctx.request.body ?? {},
    headers: {},
  }

  if (httpMethod === 'GET') {
    input.message = JSON.stringify(ctx.request.query ?? {})
  } else {
    input.message = typeof ctx.request.body === 'string'
      ? ctx.request.body
      : JSON.stringify(ctx.request.body ?? {})
  }

  try {
    const execution = await startAgentWorkflowExecution(
      match.workflowId,
      match.createdBy,
      input,
      { trigger: 'webhook' },
    )

    if (!execution) {
      ctx.status = 500
      ctx.body = { success: false, error: { message: 'Failed to start workflow' } }
      return
    }

    ctx.status = 202
    ctx.body = {
      success: true,
      data: {
        executionId: execution.id,
        workflowId: match.workflowId,
        workflowName: match.workflowName,
        status: execution.status,
      },
    }
  } catch (err) {
    logger.error({ msg: '[webhook] execution start failed', err, webhookPath })
    ctx.status = 500
    ctx.body = { success: false, error: { message: 'Webhook execution failed' } }
  }
}

router.get('/:path(.*)', handleWebhook)
router.post('/:path(.*)', handleWebhook)
router.put('/:path(.*)', handleWebhook)
router.patch('/:path(.*)', handleWebhook)
router.delete('/:path(.*)', handleWebhook)

export default router

/**
 * 工作流统一入口 — POST /api/ai/workflows/invoke/:slugOrId
 *
 * 鉴权（二选一）：
 * - X-Workflow-Key（与 workflow.invokeKey 一致）
 * - X-API-Key（sk-* 前缀，平台 API Key）
 *
 * 租户：X-Tenant-Id（默认 000000）
 *
 * 内外部、脚本、第三方均走此入口；JWT 管理面另见 agentWorkflowRoutes execute（所有者等价持钥）。
 */

import Router from '@koa/router'
import { tenantContextMiddleware } from '../middleware/tenantContext.js'
import {
  invokePublishedWorkflow,
  WorkflowInvokeError,
  readWorkflowKeyFromContext,
  readApiKeyFromContext,
  resolveInvokeTenantId,
  logInvokeAttempt,
  verifyApiKeyLookup,
  logInvokeApiKeyUsage,
} from './services/agentWorkflowInvoke.js'
import { getAgentWorkflowExecutionByInvokeKey, toExecution } from './services/agentWorkflowService.js'
import { AgentWorkflowExecutionModel, AgentWorkflowModel } from './models/agentWorkflow.js'
import { logger } from '../utils/logger.js'

const router = new Router({ prefix: '/api/ai/workflows' })

router.use(tenantContextMiddleware())

function handleInvokeError(ctx: { status: number; body: unknown }, err: unknown): boolean {
  if (err instanceof WorkflowInvokeError) {
    logger.warn({ msg: '[invokeRoutes] workflow invoke error', code: err.code, message: err.message })
    ctx.status = err.httpStatus
    ctx.body = { success: false, error: { message: err.message, code: err.code } }
    return true
  }
  return false
}

router.post('/invoke/:slugOrId', async (ctx) => {
  const slugOrId = ctx.params.slugOrId
  if (!slugOrId || slugOrId.length > 200) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid slugOrId', code: 'invalid_param' } }
    return
  }
  const body = ctx.request.body as {
    input?: Record<string, unknown>
    trigger?: 'manual' | 'webhook' | 'chat' | 'api'
    callbackUrl?: string
    callbackSecret?: string
  }

  const startTime = Date.now()

  try {
    const { execution, workflow, apiKeyUsed } = await invokePublishedWorkflow({
      slugOrId,
      invokeKey: readWorkflowKeyFromContext(ctx),
      apiKey: readApiKeyFromContext(ctx),
      tenantId: resolveInvokeTenantId(ctx),
      input: body?.input ?? {},
      trigger: body?.trigger ?? 'api',
      callbackUrl: body?.callbackUrl,
      callbackSecret: body?.callbackSecret,
    })

    logInvokeAttempt(slugOrId, true, body?.trigger ?? 'api')

    if (apiKeyUsed) {
      logInvokeApiKeyUsage(apiKeyUsed, { _id: workflow._id, name: workflow.name }, {
        endpoint: ctx.url,
        method: ctx.method,
        ip: ctx.ip,
        userAgent: ctx.get('User-Agent') || '',
        statusCode: 202,
        durationMs: Date.now() - startTime,
      })
    }

    ctx.status = 202
    ctx.body = {
      success: true,
      data: {
        executionId: execution.id,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        status: execution.status,
        execution,
      },
    }
  } catch (err) {
    logInvokeAttempt(slugOrId, false, body?.trigger ?? 'api')
    if (handleInvokeError(ctx, err)) return
    throw err
  }
})

router.get('/invoke/executions/:executionId', async (ctx) => {
  const executionId = ctx.params.executionId
  const tenantId = resolveInvokeTenantId(ctx)

  // Try X-Workflow-Key first
  const data = await getAgentWorkflowExecutionByInvokeKey(
    executionId,
    readWorkflowKeyFromContext(ctx),
    tenantId,
  )

  if (data) {
    ctx.body = { success: true, data }
    return
  }

  // Fallback: try X-API-Key
  const apiRecord = await verifyApiKeyLookup(readApiKeyFromContext(ctx), tenantId)
  if (apiRecord) {
    // API key is valid, but getAgentWorkflowExecutionByInvokeKey requires workflow invokeKey.
    // Re-query directly: find the execution and check tenant match only.
    const doc = await AgentWorkflowExecutionModel.findById(executionId).lean()
    if (doc) {
      const workflowDoc = await AgentWorkflowModel.findById(
        (doc as unknown as Record<string, unknown>).workflowId,
      ).lean()
      if (workflowDoc && !Array.isArray(workflowDoc) && workflowDoc.tenantId === tenantId) {
        ctx.body = { success: true, data: toExecution(doc as unknown as Record<string, unknown>) }
        return
      }
    }
  }

  ctx.status = 404
  ctx.body = { success: false, error: { message: 'Execution not found', code: 'execution_not_found' } }
})

export default router

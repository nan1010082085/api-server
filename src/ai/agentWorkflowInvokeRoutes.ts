/**
 * 工作流统一入口 — POST /api/ai/workflows/invoke/:slugOrId
 *
 * 鉴权：X-Workflow-Key（与 workflow.invokeKey 一致）
 * 租户：X-Tenant-Id（默认 000000）
 *
 * 内外部、脚本、第三方均走此入口；JWT 管理面另见 agentWorkflowRoutes execute（所有者等价持钥）。
 */

import Router from '@koa/router'
import { tenantContextMiddleware } from '../../middleware/tenantContext.js'
import {
  invokePublishedWorkflow,
  WorkflowInvokeError,
  readWorkflowKeyFromContext,
  resolveInvokeTenantId,
  logInvokeAttempt,
} from './services/agentWorkflowInvoke.js'
import { getAgentWorkflowExecutionByInvokeKey } from './services/agentWorkflowService.js'

const router = new Router({ prefix: '/api/ai/workflows' })

router.use(tenantContextMiddleware())

function handleInvokeError(ctx: { status: number; body: unknown }, err: unknown): boolean {
  if (err instanceof WorkflowInvokeError) {
    ctx.status = err.httpStatus
    ctx.body = { success: false, error: { message: err.message, code: err.code } }
    return true
  }
  return false
}

router.post('/invoke/:slugOrId', async (ctx) => {
  const slugOrId = ctx.params.slugOrId
  const body = ctx.request.body as {
    input?: Record<string, unknown>
    trigger?: 'manual' | 'webhook' | 'chat' | 'api'
    callbackUrl?: string
    callbackSecret?: string
  }

  try {
    const { execution } = await invokePublishedWorkflow({
      slugOrId,
      invokeKey: readWorkflowKeyFromContext(ctx),
      tenantId: resolveInvokeTenantId(ctx),
      input: body?.input ?? {},
      trigger: body?.trigger ?? 'api',
      callbackUrl: body?.callbackUrl,
      callbackSecret: body?.callbackSecret,
    })

    logInvokeAttempt(slugOrId, true, body?.trigger ?? 'api')

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
  const data = await getAgentWorkflowExecutionByInvokeKey(
    executionId,
    readWorkflowKeyFromContext(ctx),
    resolveInvokeTenantId(ctx),
  )
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Execution not found', code: 'execution_not_found' } }
    return
  }
  ctx.body = { success: true, data }
})

export default router

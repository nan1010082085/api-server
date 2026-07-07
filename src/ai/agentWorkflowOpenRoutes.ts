/**
 * Agent Workflow 开放 API
 *
 * POST   /api/ai/open/workflows/:id/execute
 * POST   /api/ai/open/workflows/by-slug/:slug/execute
 * GET    /api/ai/open/workflow-executions/:id
 * GET    /api/ai/open/workflow-executions/:id/stream
 * POST   /api/ai/open/workflow-executions/:id/resume
 * POST   /api/ai/open/workflow-executions/:id/cancel
 *
 * 鉴权：X-API-Key 或 Authorization: Bearer sk_*
 * 权限：API Key 需含 workflow:execute
 */

import Router from '@koa/router'
import { apiKeyAuthMiddleware, type ApiKeyAuthState } from '../middleware/apiKeyAuth.js'
import { isValidObjectId } from '../utils/objectId.js'
import {
  startOpenWorkflowExecution,
  getOpenWorkflowExecution,
  resumeOpenWorkflowExecution,
  cancelOpenWorkflowExecution,
  pollOpenWorkflowExecution,
  assertWorkflowExecutePermission,
  OpenWorkflowError,
} from './services/agentWorkflowOpenService.js'
import {
  findIdempotentOpenResponse,
  hashOpenExecuteRequest,
  storeIdempotentOpenResponse,
} from './services/openWorkflowIdempotency.js'

const router = new Router({ prefix: '/api/ai/open' })

router.use(apiKeyAuthMiddleware())

function getAuth(ctx: { state: { auth?: ApiKeyAuthState } }): ApiKeyAuthState {
  return ctx.state.auth!
}

function rejectInvalidObjectId(
  ctx: { status: number; body: unknown },
  id: string,
  label: string,
): boolean {
  if (!id || id === 'undefined' || !isValidObjectId(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: `Invalid ${label}`, code: 'invalid_input' } }
    return true
  }
  return false
}

function handleOpenError(ctx: { status: number; body: unknown }, err: unknown): boolean {
  if (err instanceof OpenWorkflowError) {
    ctx.status = err.httpStatus
    ctx.body = { success: false, error: { message: err.message, code: err.code } }
    return true
  }
  return false
}

function executionResponse(data: Record<string, unknown>, asyncMode: boolean) {
  if (!asyncMode) return data
  return {
    executionId: data.id,
    status: data.status,
    pollUrl: `/api/ai/open/workflow-executions/${data.id}`,
    streamUrl: `/api/ai/open/workflow-executions/${data.id}/stream`,
  }
}

async function executeWorkflow(
  ctx: {
    params: { id?: string; slug?: string }
    query: { async?: string; version?: string }
    request: { body?: unknown }
    get: (name: string) => string
    state: { auth?: ApiKeyAuthState }
    status: number
    body: unknown
  },
  lookup: { workflowId?: string; slug?: string },
) {
  const auth = getAuth(ctx)
  const asyncMode = ctx.query.async === 'true' || ctx.query.async === '1'
  const bodyPayload = (ctx.request.body ?? {}) as {
    input?: Record<string, unknown>
    callbackUrl?: string
    callbackSecret?: string
  }
  const input = bodyPayload.input ?? {}
  const idempotencyKey = ctx.get('Idempotency-Key')?.trim()
  const requestHash = idempotencyKey ? hashOpenExecuteRequest(lookup, input) : null

  try {
    if (idempotencyKey && requestHash) {
      const cached = await findIdempotentOpenResponse(auth, idempotencyKey, requestHash)
      if (cached) {
        ctx.body = cached
        return
      }
    }

    const data = await startOpenWorkflowExecution(auth, {
      ...lookup,
      input,
      callbackUrl: bodyPayload.callbackUrl,
      callbackSecret: bodyPayload.callbackSecret,
      version: ctx.query.version?.trim() || undefined,
    })
    if (!data) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: { message: 'Workflow not found or not published', code: 'workflow_not_found' },
      }
      return
    }
    const body = {
      success: true,
      data: executionResponse(data as unknown as Record<string, unknown>, asyncMode),
    }
    if (idempotencyKey && requestHash) {
      await storeIdempotentOpenResponse(auth, idempotencyKey, requestHash, data.id, body)
    }
    ctx.body = body
  } catch (err) {
    if (handleOpenError(ctx, err)) return
    throw err
  }
}

router.post('/workflows/:id/execute', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  await executeWorkflow(ctx, { workflowId: ctx.params.id })
})

router.post('/workflows/by-slug/:slug/execute', async (ctx) => {
  const slug = ctx.params.slug?.trim().toLowerCase()
  if (!slug) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'slug is required', code: 'invalid_input' } }
    return
  }
  await executeWorkflow(ctx, { slug })
})

router.get('/workflow-executions/:id', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  try {
    const data = await getOpenWorkflowExecution(ctx.params.id, getAuth(ctx))
    if (!data) {
      ctx.status = 404
      ctx.body = { success: false, error: { message: 'Execution not found', code: 'workflow_not_found' } }
      return
    }
    ctx.body = { success: true, data }
  } catch (err) {
    if (handleOpenError(ctx, err)) return
    throw err
  }
})

router.get('/workflow-executions/:id/stream', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return

  const auth = getAuth(ctx)
  try {
    assertWorkflowExecutePermission(auth)
  } catch (err) {
    if (handleOpenError(ctx, err)) return
    throw err
  }

  ctx.req.setTimeout(0)
  ctx.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  ctx.status = 200
  ctx.respond = false

  const res = ctx.res
  const executionId = ctx.params.id
  const terminal = new Set(['success', 'error', 'cancelled'])
  let lastPayload = ''
  let closed = false

  const writeEvent = (event: string, data: unknown) => {
    if (closed) return
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const poll = async () => {
    while (!closed) {
      const execution = await pollOpenWorkflowExecution(executionId, auth)
      if (!execution) {
        writeEvent('error', { code: 'workflow_not_found', message: 'Execution not found' })
        break
      }

      const payload = JSON.stringify({
        status: execution.status,
        nodeRecords: execution.nodeRecords,
        streamingOutput: execution.streamingOutput ?? null,
        error: execution.error ?? null,
      })

      if (payload !== lastPayload) {
        lastPayload = payload
        writeEvent('execution', execution)
      }

      if (terminal.has(execution.status)) {
        writeEvent('done', { executionId, status: execution.status })
        break
      }

      await new Promise((r) => setTimeout(r, 400))
    }
    closed = true
    res.end()
  }

  ctx.req.on('close', () => {
    closed = true
  })

  poll().catch((err) => {
    if (!closed) {
      writeEvent('error', { message: err instanceof Error ? err.message : String(err) })
      closed = true
      res.end()
    }
  })
})

router.post('/workflow-executions/:id/resume', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const resumeValue = (ctx.request.body as { input?: Record<string, unknown> })?.input ?? {}
  try {
    const data = await resumeOpenWorkflowExecution(ctx.params.id, getAuth(ctx), resumeValue)
    ctx.body = { success: true, data }
  } catch (err) {
    if (handleOpenError(ctx, err)) return
    throw err
  }
})

router.post('/workflow-executions/:id/cancel', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const reason = (ctx.request.body as { reason?: string })?.reason?.trim()
  try {
    const data = await cancelOpenWorkflowExecution(ctx.params.id, getAuth(ctx), reason || undefined)
    if (!data) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: { message: 'Execution not found or not cancellable', code: 'workflow_not_found' },
      }
      return
    }
    ctx.body = { success: true, data }
  } catch (err) {
    if (handleOpenError(ctx, err)) return
    throw err
  }
})

export default router

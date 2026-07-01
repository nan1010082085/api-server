/**
 * Agent 工作流编排 API
 *
 * GET    /api/ai/workflows
 * POST   /api/ai/workflows
 * GET    /api/ai/workflows/:id
 * PUT    /api/ai/workflows/:id
 * DELETE /api/ai/workflows/:id
 * POST   /api/ai/workflows/:id/publish
 * GET    /api/ai/workflows/:id/versions
 * GET    /api/ai/workflows/:id/versions/:version
 * POST   /api/ai/workflows/:id/execute
 * GET    /api/ai/workflow-executions
 * GET    /api/ai/workflow-executions/:id
 * POST   /api/ai/workflow-executions/:id/resume
 */

import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { isValidObjectId } from '../utils/objectId.js'
import {
  listAgentWorkflows,
  createAgentWorkflow,
  getAgentWorkflow,
  updateAgentWorkflow,
  deleteAgentWorkflow,
  publishAgentWorkflow,
  listAgentWorkflowVersions,
  getAgentWorkflowVersion,
  startAgentWorkflowExecution,
  listAgentWorkflowExecutions,
  getAgentWorkflowExecution,
  resumeAgentWorkflowExecution,
} from './services/agentWorkflowService.js'

const router = new Router({ prefix: '/api/ai' })

router.use(authMiddleware())

function getUserId(ctx: { state: { user?: { id?: string; userId?: string } } }): string {
  return ctx.state.user?.id ?? ctx.state.user?.userId ?? 'anonymous'
}

function rejectInvalidObjectId(
  ctx: { status: number; body: unknown },
  id: string,
  label: string,
): boolean {
  if (!id || id === 'undefined' || !isValidObjectId(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: `Invalid ${label}` } }
    return true
  }
  return false
}

router.get('/workflows', async (ctx) => {
  const items = await listAgentWorkflows(getUserId(ctx))
  ctx.body = { success: true, data: items }
})

router.post('/workflows', async (ctx) => {
  const { name, description } = ctx.request.body as { name?: string; description?: string }
  if (!name?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'name is required' } }
    return
  }
  const data = await createAgentWorkflow(getUserId(ctx), name.trim(), description?.trim() ?? '')
  ctx.body = { success: true, data }
})

router.get('/workflows/:id', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const data = await getAgentWorkflow(ctx.params.id, getUserId(ctx))
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.put('/workflows/:id', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const body = ctx.request.body as {
    name?: string
    description?: string
    draftGraph?: Record<string, unknown>
  }
  const data = await updateAgentWorkflow(ctx.params.id, getUserId(ctx), body)
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.delete('/workflows/:id', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  try {
    const ok = await deleteAgentWorkflow(ctx.params.id, getUserId(ctx))
    if (!ok) {
      ctx.status = 404
      ctx.body = { success: false, error: { message: 'Workflow not found' } }
      return
    }
    ctx.body = { success: true, data: { deleted: true } }
  } catch (err) {
    ctx.status = 409
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : '删除失败' },
    }
  }
})

router.post('/workflows/:id/publish', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const data = await publishAgentWorkflow(ctx.params.id, getUserId(ctx))
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.get('/workflows/:id/versions', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const data = await listAgentWorkflowVersions(ctx.params.id, getUserId(ctx))
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.get('/workflows/:id/versions/:version', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const data = await getAgentWorkflowVersion(ctx.params.id, getUserId(ctx), ctx.params.version)
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Version not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.post('/workflows/:id/execute', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const input = (ctx.request.body as { input?: Record<string, unknown> })?.input ?? {}
  const data = await startAgentWorkflowExecution(ctx.params.id, getUserId(ctx), input)
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.get('/workflow-executions', async (ctx) => {
  const { workflowId, page, pageSize } = ctx.query as {
    workflowId?: string
    page?: string
    pageSize?: string
  }
  if (workflowId && !isValidObjectId(workflowId)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid workflowId' } }
    return
  }
  const data = await listAgentWorkflowExecutions(getUserId(ctx), {
    workflowId,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  })
  ctx.body = { success: true, data }
})

router.get('/workflow-executions/:id', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const data = await getAgentWorkflowExecution(ctx.params.id, getUserId(ctx))
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Execution not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.post('/workflow-executions/:id/resume', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const resumeValue = (ctx.request.body as { input?: Record<string, unknown> })?.input ?? {}
  const data = await resumeAgentWorkflowExecution(ctx.params.id, getUserId(ctx), resumeValue)
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Execution not found or not waiting' } }
    return
  }
  ctx.body = { success: true, data }
})

export default router

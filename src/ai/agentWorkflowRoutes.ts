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
 * POST   /api/ai/workflow-executions/:id/cancel
 */

import Router from '@koa/router'
import type { AgentWorkflowTemplateId } from '@schema-platform/platform-shared/ai'
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
  continueAgentWorkflowExecution,
  cancelAgentWorkflowExecution,
} from './services/agentWorkflowService.js'
import {
  generateInvokeKey,
  maskInvokeKey,
} from './services/agentWorkflowInvoke.js'
import { AgentWorkflowModel } from './models/agentWorkflow.js'

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
  const { name, description, templateId } = ctx.request.body as {
    name?: string
    description?: string
    templateId?: AgentWorkflowTemplateId
  }
  if (!name?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'name is required' } }
    return
  }
  const data = await createAgentWorkflow(
    getUserId(ctx),
    name.trim(),
    description?.trim() ?? '',
    templateId ?? 'blank',
  )
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
    slug?: string
    description?: string
    draftGraph?: Record<string, unknown>
    onCompleteWebhook?: { url: string; secret?: string } | null
    routingKeywords?: string[]
  }
  try {
    const data = await updateAgentWorkflow(ctx.params.id, getUserId(ctx), body)
    if (!data) {
      ctx.status = 404
      ctx.body = { success: false, error: { message: 'Workflow not found' } }
      return
    }
    ctx.body = { success: true, data }
  } catch (err) {
    ctx.status = 422
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Update failed' },
    }
  }
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
  const body = ctx.request.body as {
    input?: Record<string, unknown>
    trigger?: 'manual' | 'webhook' | 'chat' | 'api'
  }
  const input = body?.input ?? {}
  const trigger = body?.trigger ?? 'manual'
  const userId = getUserId(ctx)

  // 平台内：JWT 所有者执行（含草稿测试）。与统一入口 invoke+key 共用 startAgentWorkflowExecution。
  const data = await startAgentWorkflowExecution(ctx.params.id, userId, input, { trigger })
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.post('/workflows/:id/rotate-invoke-key', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'workflow id')) return
  const workflow = await AgentWorkflowModel.findOne({
    _id: ctx.params.id,
    createdBy: getUserId(ctx),
  }).select('+invokeKey slug status tenantId')
  if (!workflow) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Workflow not found' } }
    return
  }
  if (workflow.status !== 'published') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: '仅已发布工作流可轮换调用密钥' } }
    return
  }
  workflow.invokeKey = generateInvokeKey()
  await workflow.save()
  const slug = workflow.slug ?? null
  ctx.body = {
    success: true,
    data: {
      invokeKey: workflow.invokeKey,
      invokeKeyMasked: maskInvokeKey(workflow.invokeKey ?? ''),
      invokePath: slug ? `/api/ai/workflows/invoke/${slug}` : null,
    },
  }
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

router.post('/workflow-executions/:id/continue', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const body = (ctx.request.body ?? {}) as { input?: Record<string, unknown> }
  const data = await continueAgentWorkflowExecution(
    ctx.params.id,
    getUserId(ctx),
    body.input ?? {},
  )
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Execution not found' } }
    return
  }
  ctx.body = { success: true, data }
})

router.post('/workflow-executions/:id/cancel', async (ctx) => {
  if (rejectInvalidObjectId(ctx, ctx.params.id, 'execution id')) return
  const reason = (ctx.request.body as { reason?: string })?.reason?.trim()
  const data = await cancelAgentWorkflowExecution(
    ctx.params.id,
    getUserId(ctx),
    reason || undefined,
  )
  if (!data) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Execution not found or not cancellable' } }
    return
  }
  ctx.body = { success: true, data }
})

export default router

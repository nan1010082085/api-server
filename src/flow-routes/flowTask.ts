import Router from '@koa/router'
import { TaskInstanceModel } from '../flow-models/TaskInstance.js'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'
import { dataScopeMiddleware } from '../middleware/dataScope.js'
import { validate } from '../middleware/validate.js'
import { completeTaskSchema, delegateTaskSchema, rejectToNodeSchema } from '../flow-schemas/instanceSchemas.js'
import { flowEngine } from '../flow-services/FlowEngine.js'
import { taskService } from '../flow-services/TaskService.js'
import { urgeFlowTask } from '../flow-services/flowUrgeService.js'
import mongoose from 'mongoose'

const requireAuth = authMiddleware({ required: true })
const requireFlowApprove = requirePermission('flow:approve')
const dataScope = dataScopeMiddleware()

const router = new Router({ prefix: '/api/flow-tasks' })

// GET /api/flow-tasks/my?q=xxx&status=pending&page=1&pageSize=20
router.get('/my', requireAuth, dataScope, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const { page: pageStr = '1', pageSize: pageSizeStr = '20', q, status } = ctx.query
  const page = Math.max(1, parseInt(pageStr as string, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string, 10) || 20))

  // Build data_scope filter for instance ownership
  const applyDataScope = ctx.state.applyDataScope as (
    base: Record<string, unknown>,
    ownerField: string,
  ) => Promise<Record<string, unknown>>
  const instanceOwnerFilter = await applyDataScope({}, 'initiatedBy')

  const result = await taskService.getMyTasks(userId, page, pageSize, {
    status: status as string | undefined,
    q: q as string | undefined,
    instanceOwnerFilter: Object.keys(instanceOwnerFilter).length > 0 ? instanceOwnerFilter : undefined,
  })
  ctx.body = { success: true, data: result }
})

// GET /api/flow-tasks/:id
router.get('/:id', requireAuth, async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const task = await TaskInstanceModel.findById(id)
  if (!task) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Task not found.' } }
    return
  }

  ctx.body = { success: true, data: task }
})

// POST /api/flow-tasks/:id/claim
router.post('/:id/claim', requireAuth, requireFlowApprove, async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const userId = (ctx.state.user as { id: string }).id
  const task = await taskService.claimTask(id, userId)
  ctx.body = { success: true, data: task }
})

// POST /api/flow-tasks/:id/complete
router.post('/:id/complete', requireAuth, requireFlowApprove, validate(completeTaskSchema), async (ctx) => {
  const { id } = ctx.params
  const { formData, outcome } = ctx.request.body as {
    formData?: Record<string, unknown>
    outcome?: string
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const userId = (ctx.state.user as { id: string }).id
  await flowEngine.completeTask(id, formData, outcome, userId)
  const task = await TaskInstanceModel.findById(id)
  ctx.body = { success: true, data: task }
})

// POST /api/flow-tasks/:id/delegate
router.post('/:id/delegate', requireAuth, requireFlowApprove, validate(delegateTaskSchema), async (ctx) => {
  const { id } = ctx.params
  const { targetUserId } = ctx.request.body as { targetUserId: string }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const task = await taskService.delegateTask(id, targetUserId)
  ctx.body = { success: true, data: task }
})

// GET /api/flow-tasks/:id/upstream-data
router.get('/:id/upstream-data', requireAuth, async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const data = await flowEngine.getUpstreamNodeData(id)
  ctx.body = { success: true, data }
})

// GET /api/flow-tasks/:id/reject-targets
router.get('/:id/reject-targets', requireAuth, async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const targets = await flowEngine.getRejectTargets(id)
  ctx.body = { success: true, data: targets }
})

// POST /api/flow-tasks/:id/reject-to-node
router.post('/:id/reject-to-node', requireAuth, requireFlowApprove, validate(rejectToNodeSchema), async (ctx) => {
  const { id } = ctx.params
  const { targetNodeId, comment } = ctx.request.body as {
    targetNodeId: string
    comment?: string
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const userId = (ctx.state.user as { id: string }).id
  await flowEngine.rejectToNode(id, targetNodeId, comment, userId)
  const task = await TaskInstanceModel.findById(id)
  ctx.body = { success: true, data: task }
})

// POST /api/flow-tasks/:id/urge — F-06 催办
router.post('/:id/urge', requireAuth, async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const userId = (ctx.state.user as { id: string }).id
  try {
    const data = await urgeFlowTask(id, userId)
    ctx.body = { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Urge failed'
    ctx.status = message === 'Task not found' ? 404 : 400
    ctx.body = { success: false, error: { message } }
  }
})

export default router

import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { buildApprovalSuggestion } from '../services/approvalSuggestionService.js'
import { buildDailyDigest } from '../services/dailyDigestService.js'
import { getCurrentTenantId } from '../middleware/tenantContext.js'
import {
  evaluateSimpleCondition,
  predictApprovalOutcome,
  scoreAssigneeCandidates,
} from '../services/aiRuntimeRules.js'

const requireAuth = authMiddleware({ required: true })

const router = new Router({ prefix: '/api/ai/runtime' })

router.post('/recommend-assignee', requireAuth, async (ctx) => {
  const { task, context } = ctx.request.body as {
    task?: { candidateUsers?: string[] }
    context?: { workload?: Record<string, number> }
  }

  const candidates = task?.candidateUsers ?? []
  const recommendations = scoreAssigneeCandidates(candidates, context ?? {})

  ctx.body = recommendations
})

router.post('/evaluate-condition', requireAuth, async (ctx) => {
  const { expression, variables } = ctx.request.body as {
    expression?: string
    variables?: Record<string, unknown>
  }

  ctx.body = { result: evaluateSimpleCondition(expression ?? '', variables ?? {}) }
})

router.post('/predict-outcome', requireAuth, async (ctx) => {
  const { formData } = ctx.request.body as { formData?: Record<string, unknown> }
  ctx.body = predictApprovalOutcome(formData ?? {})
})

router.post('/detect-anomaly', requireAuth, async (ctx) => {
  const { tasks } = ctx.request.body as { tasks?: Array<{ status?: string; createdAt?: string; nodeName?: string; nodeId?: string }> }
  const now = new Date()
  const pendingTasks = (tasks ?? []).filter((t) => t.status === 'pending' || t.status === 'claimed')

  for (const task of pendingTasks) {
    const createdAt = new Date(task.createdAt ?? 0)
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

    if (hoursDiff > 48) {
      ctx.body = {
        type: 'timeout',
        severity: 'medium',
        description: `任务 "${task.nodeName}" 已等待超过 48 小时`,
        suggestion: '建议催办或委派给其他审批人',
        affectedNodes: [task.nodeId],
      }
      return
    }
  }

  ctx.body = null
})

router.post('/approval-suggestion', requireAuth, async (ctx) => {
  const body = ctx.request.body as {
    task?: { id?: string }
    taskId?: string
    submissionId?: string
    formData?: Record<string, unknown>
    context?: Record<string, unknown>
  }

  const result = await buildApprovalSuggestion({
    taskId: body.taskId ?? body.task?.id,
    submissionId: body.submissionId,
    formData: body.formData,
    flowContext: body.context,
  })

  ctx.body = result
})

router.get('/daily-digest', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id?: string })?.id
  const tenantId = getCurrentTenantId(ctx)
  const digest = await buildDailyDigest(tenantId, userId)
  ctx.body = { success: true, data: digest }
})

export default router

/**
 * Workbench dashboard aggregation API (S-07).
 *
 * GET /api/dashboard — KPI counts for workbench Schema widgets.
 */

import Router from '@koa/router'
import { TaskInstanceModel } from '../flow-models/TaskInstance.js'
import { FlowInstanceModel } from '../flow-models/FlowInstance.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { UserModel } from '../models/User.js'
import { authMiddleware } from '../middleware/auth.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/dashboard' })

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

async function countPendingTasksForUser(userId: string): Promise<number> {
  const user = await UserModel.findById(userId).select('roles').lean()
  const userRoles = (user as { roles?: string[] } | null)?.roles ?? []

  return TaskInstanceModel.countDocuments({
    status: { $in: ['pending', 'claimed'] },
    $or: [
      { assignee: userId },
      { candidateUsers: userId },
      { candidateRoles: { $in: userRoles } },
    ],
  })
}

async function buildWeeklyApprovalTrend(): Promise<Array<{ date: string; count: number }>> {
  const today = startOfDay()
  const from = new Date(today)
  from.setDate(from.getDate() - 6)

  const rows = await FlowInstanceModel.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: from },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$completedAt' },
        },
        count: { $sum: 1 },
      },
    },
  ])

  const countByDate = new Map(rows.map((r) => [r._id, r.count]))
  const trend: Array<{ date: string; count: number }> = []

  for (let i = 0; i < 7; i++) {
    const day = new Date(from)
    day.setDate(from.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    trend.push({ date: key, count: countByDate.get(key) ?? 0 })
  }

  return trend
}

router.get('/', requireAuth, async (ctx) => {
  const userId = (ctx.state.user as { id: string }).id
  const monthStart = startOfMonth()

  const [
    pendingApprovals,
    myInitiatedRunning,
    myInitiatedTotal,
    monthlyApplications,
    totalSubmissions,
    flowRunning,
    flowCompleted,
    weeklyApprovals,
  ] = await Promise.all([
    countPendingTasksForUser(userId),
    FlowInstanceModel.countDocuments({ initiatedBy: userId, status: 'running' }),
    FlowInstanceModel.countDocuments({ initiatedBy: userId }),
    FormSubmissionModel.countDocuments({
      submitterId: userId,
      createdAt: { $gte: monthStart },
    }),
    FormSubmissionModel.countDocuments({ submitterId: userId }),
    FlowInstanceModel.countDocuments({ status: 'running' }),
    FlowInstanceModel.countDocuments({ status: 'completed' }),
    buildWeeklyApprovalTrend(),
  ])

  ctx.body = {
    success: true,
    data: {
      kpis: {
        pendingApprovals,
        myInitiated: myInitiatedRunning,
        monthlyApplications,
        unreadAnnouncements: 0,
      },
      flows: {
        running: flowRunning,
        completed: flowCompleted,
        initiatedByMe: myInitiatedTotal,
      },
      submissions: {
        thisMonth: monthlyApplications,
        total: totalSubmissions,
      },
      trends: {
        weeklyApprovals,
      },
    },
  }
})

export default router

/**
 * A-06 — 每日摘要（规则版，Phase 1–2 不依赖 LLM）
 */
import { TaskInstanceModel } from '../flow-models/TaskInstance.js'
import { FormSubmissionModel } from '../models/FormSubmission.js'
import { NoticeModel } from '../models/Notice.js'
import { DEFAULT_TENANT_ID } from '../utils/initDefaultTenant.js'

export interface DailyDigestResult {
  date: string
  pendingTasks: number
  todaySubmissions: number
  publishedNotices: number
  highlights: string[]
}

export async function buildDailyDigest(tenantId = DEFAULT_TENANT_ID, userId?: string): Promise<DailyDigestResult> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const taskFilter: Record<string, unknown> = {
    tenantId,
    status: { $in: ['pending', 'claimed'] },
  }
  if (userId) {
    taskFilter.$or = [{ assignee: userId }, { candidateUsers: userId }]
  }

  const [pendingTasks, todaySubmissions, publishedNotices] = await Promise.all([
    TaskInstanceModel.countDocuments(taskFilter),
    FormSubmissionModel.countDocuments({ tenantId, createdAt: { $gte: startOfDay } }),
    NoticeModel.countDocuments({ tenantId, status: 'published' }),
  ])

  const highlights: string[] = []
  if (pendingTasks > 0) highlights.push(`您有 ${pendingTasks} 条待办任务待处理`)
  if (todaySubmissions > 0) highlights.push(`今日新增 ${todaySubmissions} 条业务提交`)
  if (publishedNotices > 0) highlights.push(`平台共有 ${publishedNotices} 条已发布公告`)
  if (highlights.length === 0) highlights.push('今日暂无待办，祝您工作顺利')

  return {
    date: startOfDay.toISOString().slice(0, 10),
    pendingTasks,
    todaySubmissions,
    publishedNotices,
    highlights,
  }
}

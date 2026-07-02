import { FormSubmissionModel } from '../../models/FormSubmission.js'
import { UserModel } from '../../models/User.js'
import { DeptModel } from '../../models/Dept.js'
import { resolveFormSchemaIdByCode } from './schemaCodeResolver.js'
import { LEAVE_TYPE_LABELS } from './leaveTypeLabels.js'

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export interface HrLeaveStatsPayload {
  monthlyCount: number
  avgDays: number
  monthlyTrend: Array<{ category: string; value: number }>
  byLeaveType: Array<{ category: string; value: number }>
  byDept: Array<{ category: string; value: number }>
}

export async function getHrLeaveStats(): Promise<HrLeaveStatsPayload> {
  const schemaId = await resolveFormSchemaIdByCode('hr-leave-apply')
  if (!schemaId) {
    return {
      monthlyCount: 0,
      avgDays: 0,
      monthlyTrend: [],
      byLeaveType: [],
      byDept: [],
    }
  }

  const monthStart = startOfMonth()
  const sixMonthsAgo = new Date(monthStart)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)

  const [monthlyDocs, trendDocs] = await Promise.all([
    FormSubmissionModel.find({ schemaId, createdAt: { $gte: monthStart } }).lean(),
    FormSubmissionModel.find({ schemaId, createdAt: { $gte: sixMonthsAgo } }).lean(),
  ])

  const monthlyCount = monthlyDocs.length
  const daysSum = monthlyDocs.reduce((sum, doc) => {
    const days = Number((doc.data as Record<string, unknown>)?.days ?? 0)
    return sum + (Number.isFinite(days) ? days : 0)
  }, 0)
  const avgDays = monthlyCount > 0 ? Math.round((daysSum / monthlyCount) * 10) / 10 : 0

  const typeCount = new Map<string, number>()
  for (const doc of monthlyDocs) {
    const t = String((doc.data as Record<string, unknown>)?.leaveType ?? 'other')
    typeCount.set(t, (typeCount.get(t) ?? 0) + 1)
  }
  const byLeaveType = [...typeCount.entries()].map(([key, value]) => ({
    category: LEAVE_TYPE_LABELS[key] ?? key,
    value,
  }))

  const submitterIds = [...new Set(monthlyDocs.map((d) => d.submitterId).filter(Boolean))] as string[]
  const users = submitterIds.length
    ? await UserModel.find({ _id: { $in: submitterIds } }).select('deptId').lean()
    : []
  const userDeptMap = new Map(users.map((u) => [String(u._id), u.deptId]))
  const deptIds = [...new Set(users.map((u) => u.deptId).filter(Boolean))] as string[]
  const depts = deptIds.length
    ? await DeptModel.find({ _id: { $in: deptIds } }).select('name').lean()
    : []
  const deptNameMap = new Map(depts.map((d) => [String(d._id), d.name]))

  const deptDays = new Map<string, number>()
  for (const doc of monthlyDocs) {
    const deptId = doc.submitterId ? userDeptMap.get(String(doc.submitterId)) : null
    const deptName = deptId ? (deptNameMap.get(String(deptId)) ?? '未分配部门') : '未分配部门'
    const days = Number((doc.data as Record<string, unknown>)?.days ?? 0)
    deptDays.set(deptName, (deptDays.get(deptName) ?? 0) + (Number.isFinite(days) ? days : 0))
  }
  const byDept = [...deptDays.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)

  const monthBuckets = new Map<string, number>()
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMonthsAgo)
    d.setMonth(sixMonthsAgo.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthBuckets.set(key, 0)
  }
  for (const doc of trendDocs) {
    const created = doc.createdAt as Date
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    if (monthBuckets.has(key)) {
      monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + 1)
    }
  }
  const monthlyTrend = [...monthBuckets.entries()].map(([category, value]) => ({ category, value }))

  return {
    monthlyCount,
    avgDays,
    monthlyTrend,
    byLeaveType,
    byDept,
  }
}

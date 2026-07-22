/**
 * Telemetry ingest + funnel summary (A2.1)
 *
 * POST /api/telemetry/events          - batch client events (max 100)
 * POST /api/telemetry/errors          - single error report
 * GET  /api/telemetry/funnel          - counts for AI funnel event names (?hours=24)
 * GET  /api/telemetry/summary         - alias of funnel
 * GET  /api/telemetry/editor-summary  - editor 关键路径事件聚合看板 (?hours=168)
 */

import Router from '@koa/router'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { TelemetryEventModel } from '../models/TelemetryEvent.js'
import { TelemetryErrorModel } from '../models/TelemetryError.js'
import {
  EDITOR_EVENT_NAMES,
  editorSummaryQuerySchema,
  FUNNEL_EVENT_NAMES,
  telemetryErrorBodySchema,
  telemetryEventsBodySchema,
  telemetryFunnelQuerySchema,
  type TelemetryErrorBody,
  type TelemetryEventsBody,
} from '../schemas/telemetrySchemas.js'

const router = new Router({ prefix: '/api/telemetry' })
const requireAuth = authMiddleware({ required: true })

router.use(requireAuth)

router.post('/events', validate(telemetryEventsBodySchema), async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const body = ctx.request.body as TelemetryEventsBody

  const docs = body.events.map((ev) => ({
    tenantId: user.tenantId,
    userId: user.id,
    name: ev.name,
    properties: ev.properties ?? {},
    clientTimestamp: ev.timestamp ?? null,
  }))

  await TelemetryEventModel.insertMany(docs, { ordered: false })

  ctx.status = 201
  ctx.body = { success: true, data: { accepted: docs.length } }
})

router.post('/errors', validate(telemetryErrorBodySchema), async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const body = ctx.request.body as TelemetryErrorBody

  const doc = await TelemetryErrorModel.create({
    tenantId: user.tenantId,
    userId: user.id,
    message: body.message,
    stack: body.stack ?? null,
    context: body.context ?? {},
    clientTimestamp: body.timestamp ?? null,
  })

  ctx.status = 201
  ctx.body = { success: true, data: { id: String(doc._id) } }
})

async function buildFunnelSummary(tenantId: string, hours: number) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const rows = await TelemetryEventModel.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        tenantId,
        name: { $in: [...FUNNEL_EVENT_NAMES] },
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: '$name', count: { $sum: 1 } } },
  ])

  const counts: Record<string, number> = {}
  for (const name of FUNNEL_EVENT_NAMES) {
    counts[name] = 0
  }
  for (const row of rows) {
    counts[row._id] = row.count
  }

  const errorCount = await TelemetryErrorModel.countDocuments({
    tenantId,
    createdAt: { $gte: since },
  })

  return {
    hours,
    since: since.toISOString(),
    funnel: counts,
    errorCount,
    totalFunnelEvents: Object.values(counts).reduce((a, b) => a + b, 0),
  }
}

router.get('/funnel', async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const parsed = telemetryFunnelQuerySchema.safeParse(ctx.query)
  if (!parsed.success) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: {
        message: 'Validation failed',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
    return
  }
  const data = await buildFunnelSummary(user.tenantId, parsed.data.hours)
  ctx.body = { success: true, data }
})

router.get('/summary', async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const parsed = telemetryFunnelQuerySchema.safeParse(ctx.query)
  if (!parsed.success) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: {
        message: 'Validation failed',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
    return
  }
  const data = await buildFunnelSummary(user.tenantId, parsed.data.hours)
  ctx.body = { success: true, data }
})

interface EditorTotalsRow {
  _id: string
  count: number
}

interface EditorDailyRow {
  _id: { date: string; name: string }
  count: number
}

interface EditorTopSchemaRow {
  _id: string
  count: number
}

interface EditorActiveUserRow {
  _id: string
}

async function buildEditorSummary(tenantId: string, hours: number) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const editorNames = [...EDITOR_EVENT_NAMES]
  const match = {
    tenantId,
    name: { $in: editorNames },
    createdAt: { $gte: since },
  }

  // 1. 按事件名汇总
  const totalsRows = await TelemetryEventModel.aggregate<EditorTotalsRow>([
    { $match: match },
    { $group: { _id: '$name', count: { $sum: 1 } } },
  ])
  const totals: Record<string, number> = {}
  for (const name of editorNames) totals[name] = 0
  for (const row of totalsRows) {
    // 仅记录 editor 事件名（防御：match 已限定 name in editorNames，此处再校验）
    if (totals[row._id] !== undefined) totals[row._id] = row.count
  }

  // 2. 按天 + 事件名汇总（timeseries）
  const dailyRows = await TelemetryEventModel.aggregate<EditorDailyRow>([
    { $match: match },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          name: '$name',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ])
  const dailyMap = new Map<string, Record<string, number>>()
  for (const row of dailyRows) {
    const day = dailyMap.get(row._id.date) ?? {}
    day[row._id.name] = row.count
    dailyMap.set(row._id.date, day)
  }
  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, counts]) => ({ date, counts }))

  // 3. 最活跃的 schema（从 properties.schemaId 提取）
  const topSchemaRows = await TelemetryEventModel.aggregate<EditorTopSchemaRow>([
    { $match: match },
    { $match: { 'properties.schemaId': { $exists: true, $ne: null } } },
    { $group: { _id: '$properties.schemaId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ])
  const topSchemas = topSchemaRows.map((r) => ({ schemaId: String(r._id), count: r.count }))

  // 4. 活跃用户数（唯一 userId）
  const activeUserRows = await TelemetryEventModel.aggregate<EditorActiveUserRow>([
    { $match: match },
    { $group: { _id: '$userId' } },
  ])
  const activeUsers = activeUserRows.length

  const totalEvents = Object.values(totals).reduce((a, b) => a + b, 0)

  return {
    hours,
    since: since.toISOString(),
    totals,
    totalEvents,
    activeUsers,
    daily,
    topSchemas,
  }
}

router.get('/editor-summary', validateQuery(editorSummaryQuerySchema), async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const hours = Number(ctx.query.hours) || 168
  const data = await buildEditorSummary(user.tenantId, hours)
  ctx.body = { success: true, data }
})

export default router

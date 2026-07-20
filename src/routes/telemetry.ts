/**
 * Telemetry ingest + funnel summary (A2.1)
 *
 * POST /api/telemetry/events  — batch client events (max 100)
 * POST /api/telemetry/errors  — single error report
 * GET  /api/telemetry/funnel  — counts for AI funnel event names (?hours=24)
 * GET  /api/telemetry/summary — alias of funnel
 */

import Router from '@koa/router'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { TelemetryEventModel } from '../models/TelemetryEvent.js'
import { TelemetryErrorModel } from '../models/TelemetryError.js'
import {
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

export default router

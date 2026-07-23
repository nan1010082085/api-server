/**
 * Agent Performance Monitoring Routes.
 *
 * GET /api/ai/monitor/stats   — Agent performance statistics
 * GET /api/ai/monitor/recent  — Recent agent metrics
 * GET /api/ai/monitor/alerts  — Performance alerts (slow operations, failures)
 * GET /api/ai/monitor/summary — Quick summary of agent performance
 */

import Router from '@koa/router'
import { AgentMetricModel } from './models/monitor.js'
import { WorkflowNodeMetricModel } from './models/workflowNodeMetric.js'
import { PluginMetricModel } from './models/pluginMetric.js'
import { authMiddleware } from '../middleware/auth.js'

const router = new Router({ prefix: '/api/ai/monitor' })

// All monitor routes require authentication
router.use(authMiddleware())

// ────────────────────────────────────────────
// GET /api/ai/monitor/stats — Agent performance statistics
// ────────────────────────────────────────────

/**
 * Query params:
 * - agentName: Filter by agent name (thinker, editor, flow, general, summarizer)
 * - operation: Filter by operation type (invoke, tool_call, think, stream)
 * - startDate: Start date for time range filter (ISO 8601)
 * - endDate: End date for time range filter (ISO 8601)
 */
router.get('/stats', async (ctx) => {
  const { agentName, operation, startDate, endDate } = ctx.query as {
    agentName?: string
    operation?: string
    startDate?: string
    endDate?: string
  }

  const matchStage: Record<string, unknown> = {}
  if (agentName) matchStage.agentName = agentName
  if (operation) matchStage.operation = operation
  if (startDate || endDate) {
    matchStage.createdAt = {}
    if (startDate) (matchStage.createdAt as Record<string, Date>).$gte = new Date(startDate)
    if (endDate) (matchStage.createdAt as Record<string, Date>).$lte = new Date(endDate)
  }

  const stats = await AgentMetricModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          agentName: '$agentName',
          operation: '$operation',
        },
        avgDuration: { $avg: '$duration' },
        minDuration: { $min: '$duration' },
        maxDuration: { $max: '$duration' },
        durations: { $push: '$duration' },
        successRate: {
          $avg: { $cond: ['$success', 1, 0] },
        },
        totalCalls: { $sum: 1 },
        successCount: {
          $sum: { $cond: ['$success', 1, 0] },
        },
        failureCount: {
          $sum: { $cond: ['$success', 0, 1] },
        },
        totalTokens: {
          $sum: { $ifNull: ['$tokenUsage.total', 0] },
        },
        avgTokens: {
          $avg: { $ifNull: ['$tokenUsage.total', 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        agentName: '$_id.agentName',
        operation: '$_id.operation',
        avgDuration: { $round: ['$avgDuration', 2] },
        minDuration: 1,
        maxDuration: 1,
        p95Duration: {
          $let: {
            vars: {
              sorted: { $sortArray: { input: '$durations', sortBy: 1 } },
              count: { $size: '$durations' },
            },
            in: {
              $arrayElemAt: [
                '$$sorted',
                { $subtract: [{ $ceil: { $multiply: ['$$count', 0.95] } }, 1] },
              ],
            },
          },
        },
        successRate: { $round: [{ $multiply: ['$successRate', 100] }, 2] },
        totalCalls: 1,
        successCount: 1,
        failureCount: 1,
        totalTokens: 1,
        avgTokens: { $round: ['$avgTokens', 2] },
      },
    },
    { $sort: { agentName: 1, operation: 1 } },
  ])

  ctx.body = {
    success: true,
    data: stats,
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/recent — Recent agent metrics
// ────────────────────────────────────────────

/**
 * Query params:
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 * - limit: Legacy param, used as pageSize if page/pageSize not provided (default 50, max 200)
 * - agentName: Filter by agent name
 * - success: Filter by success status (true/false)
 */
router.get('/recent', async (ctx) => {
  const { limit: limitStr, agentName, success: successStr, page: pageStr, pageSize: pageSizeStr } = ctx.query as {
    limit?: string
    agentName?: string
    success?: string
    page?: string
    pageSize?: string
  }

  const page = Math.max(1, parseInt(pageStr as string) || 1)
  const defaultPageSize = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string) || defaultPageSize))

  const filter: Record<string, unknown> = {}
  if (agentName) filter.agentName = agentName
  if (successStr !== undefined) filter.success = successStr === 'true'

  const [metrics, total] = await Promise.all([
    AgentMetricModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AgentMetricModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: metrics.map((m) => ({
        id: m._id,
        agentName: m.agentName,
        operation: m.operation,
        duration: m.duration,
        success: m.success,
        error: m.error,
        tokenUsage: m.tokenUsage,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/alerts — Performance alerts
// ────────────────────────────────────────────

/**
 * Returns metrics that indicate potential issues:
 * - Slow operations (duration > threshold)
 * - Failed operations
 * - High token usage
 *
 * Query params:
 * - threshold: Duration threshold in ms for slow operations (default 10000)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 * - limit: Legacy param, used as pageSize if page/pageSize not provided (default 20, max 100)
 */
router.get('/alerts', async (ctx) => {
  const { threshold: thresholdStr, limit: limitStr, page: pageStr, pageSize: pageSizeStr } = ctx.query as {
    threshold?: string
    limit?: string
    page?: string
    pageSize?: string
  }

  const threshold = parseInt(thresholdStr ?? '10000', 10) || 10000
  const page = Math.max(1, parseInt(pageStr as string) || 1)
  const defaultPageSize = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100) : 20
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string) || defaultPageSize))

  const result = await AgentMetricModel.aggregate([
    {
      $match: {
        $or: [
          { success: false },
          { duration: { $gte: threshold } },
          { 'tokenUsage.total': { $gte: 10000 } },
        ],
      },
    },
    {
      $addFields: {
        alertType: {
          $switch: {
            branches: [
              { case: { $eq: ['$success', false] }, then: 'failure' },
              { case: { $gte: ['$duration', threshold] }, then: 'slow' },
              { case: { $gte: ['$tokenUsage.total', 10000] }, then: 'high_token' },
            ],
            default: 'unknown',
          },
        },
      },
    },
    {
      $facet: {
        items: [
          { $sort: { createdAt: -1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          {
            $project: {
              _id: 0,
              id: '$_id',
              agentName: 1,
              operation: 1,
              duration: 1,
              success: 1,
              error: 1,
              tokenUsage: 1,
              alertType: 1,
              createdAt: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ])

  const alerts = result[0].items
  const total = result[0].totalCount[0]?.count ?? 0

  ctx.body = {
    success: true,
    data: {
      items: alerts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/summary — Quick summary of agent performance
// ────────────────────────────────────────────

/**
 * Returns high-level metrics for dashboard display.
 *
 * Query params:
 * - hours: Time window in hours (default 24)
 */
router.get('/summary', async (ctx) => {
  const { hours } = ctx.query as { hours?: string }
  const hoursNum = parseInt(hours ?? '24', 10) || 24
  const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000)

  const [summary] = await AgentMetricModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
        avgDuration: { $avg: '$duration' },
        maxDuration: { $max: '$duration' },
        totalTokens: { $sum: { $ifNull: ['$tokenUsage.total', 0] } },
        slowCalls: {
          $sum: { $cond: [{ $gte: ['$duration', 10000] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalCalls: 1,
        successCount: 1,
        failureCount: 1,
        successRate: {
          $round: [
            { $multiply: [{ $divide: ['$successCount', { $max: ['$totalCalls', 1] }] }, 100] },
            2,
          ],
        },
        avgDuration: { $round: ['$avgDuration', 2] },
        maxDuration: 1,
        totalTokens: 1,
        slowCalls: 1,
        periodHours: hoursNum,
      },
    },
  ])

  ctx.body = {
    success: true,
    data: summary ?? {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgDuration: 0,
      maxDuration: 0,
      totalTokens: 0,
      slowCalls: 0,
      periodHours: hoursNum,
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/node-stats — Node-level aggregate stats
// ────────────────────────────────────────────

/**
 * Returns per-node performance statistics across workflow executions.
 * Answers: which node is slowest, which fails most, execution count per node.
 *
 * Query params:
 * - workflowId: Filter by workflow ID
 * - nodeType: Filter by node type (llm, tool, agent-intent, etc.)
 * - startDate: Start date for time range filter (ISO 8601)
 * - endDate: End date for time range filter (ISO 8601)
 * - sortBy: Sort field — 'avgDuration' | 'failureRate' | 'totalRuns' (default: 'avgDuration')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
router.get('/node-stats', async (ctx) => {
  const { workflowId, nodeType, startDate, endDate, sortBy, sortOrder } = ctx.query as {
    workflowId?: string
    nodeType?: string
    startDate?: string
    endDate?: string
    sortBy?: string
    sortOrder?: string
  }

  const matchStage: Record<string, unknown> = {}
  if (workflowId) matchStage.workflowId = workflowId
  if (nodeType) matchStage.nodeType = nodeType
  if (startDate || endDate) {
    matchStage.createdAt = {}
    if (startDate) (matchStage.createdAt as Record<string, Date>).$gte = new Date(startDate)
    if (endDate) (matchStage.createdAt as Record<string, Date>).$lte = new Date(endDate)
  }

  // Cap input to prevent $push memory explosion on high-cardinality groups
  const MAX_DOCS_FOR_STATS = 50_000

  const stats = await WorkflowNodeMetricModel.aggregate([
    { $match: matchStage },
    { $limit: MAX_DOCS_FOR_STATS },
    {
      $group: {
        _id: {
          nodeId: '$nodeId',
          nodeType: '$nodeType',
          nodeName: '$nodeName',
        },
        avgDuration: { $avg: '$duration' },
        minDuration: { $min: '$duration' },
        maxDuration: { $max: '$duration' },
        durations: { $push: '$duration' },
        totalRuns: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
        failureRate: { $avg: { $cond: ['$success', 0, 1] } },
        recentErrors: {
          $push: {
            $cond: [
              { $not: ['$success'] },
              { error: '$error', at: '$createdAt' },
              '$$REMOVE',
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        nodeId: '$_id.nodeId',
        nodeType: '$_id.nodeType',
        nodeName: '$_id.nodeName',
        avgDuration: { $round: ['$avgDuration', 2] },
        minDuration: 1,
        maxDuration: 1,
        p95Duration: {
          $let: {
            vars: {
              sorted: { $sortArray: { input: '$durations', sortBy: 1 } },
              count: { $size: '$durations' },
            },
            in: {
              $arrayElemAt: [
                '$$sorted',
                { $subtract: [{ $ceil: { $multiply: ['$$count', 0.95] } }, 1] },
              ],
            },
          },
        },
        totalRuns: 1,
        successCount: 1,
        failureCount: 1,
        failureRate: { $round: [{ $multiply: ['$failureRate', 100] }, 2] },
        recentErrors: { $slice: ['$recentErrors', -5] },
      },
    },
    {
      $sort: (() => {
        const field = sortBy === 'failureRate' ? 'failureRate'
          : sortBy === 'totalRuns' ? 'totalRuns'
            : 'avgDuration'
        const dir = sortOrder === 'asc' ? 1 : -1
        return { [field]: dir } as Record<string, 1 | -1>
      })(),
    },
  ])

  ctx.body = {
    success: true,
    data: stats,
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/node-stats/recent — Recent node metric records
// ────────────────────────────────────────────

/**
 * Returns raw node metric records (non-aggregated).
 *
 * Query params:
 * - workflowId: Filter by workflow ID
 * - nodeId: Filter by node ID
 * - success: Filter by success status (true/false)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 */
router.get('/node-stats/recent', async (ctx) => {
  const { workflowId, nodeId, success: successStr, page: pageStr, pageSize: pageSizeStr } = ctx.query as {
    workflowId?: string
    nodeId?: string
    success?: string
    page?: string
    pageSize?: string
  }

  const page = Math.max(1, parseInt(pageStr as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string) || 20))

  const filter: Record<string, unknown> = {}
  if (workflowId) filter.workflowId = workflowId
  if (nodeId) filter.nodeId = nodeId
  if (successStr !== undefined) filter.success = successStr === 'true'

  const [records, total] = await Promise.all([
    WorkflowNodeMetricModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    WorkflowNodeMetricModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: records.map((r) => ({
        id: r._id,
        workflowId: r.workflowId,
        workflowName: r.workflowName,
        nodeId: r.nodeId,
        nodeType: r.nodeType,
        nodeName: r.nodeName,
        executionId: r.executionId,
        duration: r.duration,
        success: r.success,
        error: r.error,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/node-stats/timeline — Node metrics over time
// ────────────────────────────────────────────

/**
 * Returns node metrics grouped by time bucket for trend analysis.
 *
 * Query params:
 * - workflowId: Filter by workflow ID (required)
 * - nodeId: Filter by specific node ID
 * - hours: Time window in hours (default 24)
 * - bucketMinutes: Bucket size in minutes (default 60)
 */
router.get('/node-stats/timeline', async (ctx) => {
  const { workflowId, nodeId, hours: hoursStr, bucketMinutes: bucketStr } = ctx.query as {
    workflowId?: string
    nodeId?: string
    hours?: string
    bucketMinutes?: string
  }

  if (!workflowId) {
    ctx.status = 400
    ctx.body = { success: false, error: 'workflowId is required' }
    return
  }

  const hoursNum = parseInt(hoursStr ?? '24', 10) || 24
  const bucketMs = (parseInt(bucketStr ?? '60', 10) || 60) * 60 * 1000
  const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000)

  const matchStage: Record<string, unknown> = {
    workflowId,
    createdAt: { $gte: since },
  }
  if (nodeId) matchStage.nodeId = nodeId

  const timeline = await WorkflowNodeMetricModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          bucket: {
            $toDate: {
              $multiply: [
                { $floor: { $divide: [{ $toLong: '$createdAt' }, bucketMs] } },
                bucketMs,
              ],
            },
          },
          nodeId: '$nodeId',
          nodeType: '$nodeType',
        },
        avgDuration: { $avg: '$duration' },
        totalRuns: { $sum: 1 },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
      },
    },
    {
      $project: {
        _id: 0,
        bucket: '$_id.bucket',
        nodeId: '$_id.nodeId',
        nodeType: '$_id.nodeType',
        avgDuration: { $round: ['$avgDuration', 2] },
        totalRuns: 1,
        failureCount: 1,
      },
    },
    { $sort: { bucket: 1, nodeId: 1 } },
  ])

  ctx.body = {
    success: true,
    data: {
      timeline,
      periodHours: hoursNum,
      bucketMinutes: bucketMs / 60000,
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/node-type-stats — 按节点类型聚合
// ────────────────────────────────────────────

router.get('/node-type-stats', async (ctx) => {
  const stats = await WorkflowNodeMetricModel.aggregate([
    {
      $group: {
        _id: '$nodeType',
        totalCalls: { $sum: 1 },
        successRate: { $avg: { $cond: ['$success', 1, 0] } },
        avgDuration: { $avg: '$duration' },
        maxDuration: { $max: '$duration' },
      },
    },
    { $sort: { totalCalls: -1 } },
  ])

  ctx.body = {
    success: true,
    data: stats.map((s) => ({
      nodeType: s._id,
      totalCalls: s.totalCalls,
      successRate: Math.round(s.successRate * 100),
      avgDuration: Math.round(s.avgDuration),
      maxDuration: s.maxDuration,
    })),
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/plugin-stats — Plugin performance statistics
// ────────────────────────────────────────────

/**
 * Returns per-plugin performance statistics.
 *
 * Query params:
 * - pluginType: Filter by plugin type (expert, tool, mcp, skill)
 * - startDate: Start date for time range filter (ISO 8601)
 * - endDate: End date for time range filter (ISO 8601)
 * - sortBy: Sort field — 'avgDuration' | 'failureRate' | 'totalCalls' (default: 'totalCalls')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
router.get('/plugin-stats', async (ctx) => {
  const { pluginType, startDate, endDate, sortBy, sortOrder } = ctx.query as {
    pluginType?: string
    startDate?: string
    endDate?: string
    sortBy?: string
    sortOrder?: string
  }

  const matchStage: Record<string, unknown> = {}
  if (pluginType) matchStage.pluginType = pluginType
  if (startDate || endDate) {
    matchStage.createdAt = {}
    if (startDate) (matchStage.createdAt as Record<string, Date>).$gte = new Date(startDate)
    if (endDate) (matchStage.createdAt as Record<string, Date>).$lte = new Date(endDate)
  }

  const MAX_DOCS_FOR_STATS = 50_000

  const stats = await PluginMetricModel.aggregate([
    { $match: matchStage },
    { $limit: MAX_DOCS_FOR_STATS },
    {
      $group: {
        _id: {
          pluginId: '$pluginId',
          pluginName: '$pluginName',
          pluginType: '$pluginType',
        },
        avgDuration: { $avg: '$duration' },
        minDuration: { $min: '$duration' },
        maxDuration: { $max: '$duration' },
        durations: { $push: '$duration' },
        totalCalls: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
        failureRate: { $avg: { $cond: ['$success', 0, 1] } },
        recentErrors: {
          $push: {
            $cond: [
              { $not: ['$success'] },
              { error: '$error', at: '$createdAt' },
              '$$REMOVE',
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        pluginId: '$_id.pluginId',
        pluginName: '$_id.pluginName',
        pluginType: '$_id.pluginType',
        avgDuration: { $round: ['$avgDuration', 2] },
        minDuration: 1,
        maxDuration: 1,
        p95Duration: {
          $let: {
            vars: {
              sorted: { $sortArray: { input: '$durations', sortBy: 1 } },
              count: { $size: '$durations' },
            },
            in: {
              $arrayElemAt: [
                '$$sorted',
                { $subtract: [{ $ceil: { $multiply: ['$$count', 0.95] } }, 1] },
              ],
            },
          },
        },
        totalCalls: 1,
        successCount: 1,
        failureCount: 1,
        failureRate: { $round: [{ $multiply: ['$failureRate', 100] }, 2] },
        recentErrors: { $slice: ['$recentErrors', -5] },
      },
    },
    {
      $sort: (() => {
        const field = sortBy === 'failureRate' ? 'failureRate'
          : sortBy === 'avgDuration' ? 'avgDuration'
            : 'totalCalls'
        const dir = sortOrder === 'asc' ? 1 : -1
        return { [field]: dir } as Record<string, 1 | -1>
      })(),
    },
  ])

  ctx.body = {
    success: true,
    data: stats,
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/plugin-recent — Recent plugin metric records
// ────────────────────────────────────────────

/**
 * Returns raw plugin metric records (non-aggregated).
 *
 * Query params:
 * - pluginId: Filter by plugin ID
 * - pluginType: Filter by plugin type (expert, tool, mcp, skill)
 * - success: Filter by success status (true/false)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 100)
 */
router.get('/plugin-recent', async (ctx) => {
  const { pluginId, pluginType, success: successStr, page: pageStr, pageSize: pageSizeStr } = ctx.query as {
    pluginId?: string
    pluginType?: string
    success?: string
    page?: string
    pageSize?: string
  }

  const page = Math.max(1, parseInt(pageStr as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr as string) || 20))

  const filter: Record<string, unknown> = {}
  if (pluginId) filter.pluginId = pluginId
  if (pluginType) filter.pluginType = pluginType
  if (successStr !== undefined) filter.success = successStr === 'true'

  const [records, total] = await Promise.all([
    PluginMetricModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PluginMetricModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: records.map((r) => ({
        id: r._id,
        pluginId: r.pluginId,
        pluginName: r.pluginName,
        pluginType: r.pluginType,
        duration: r.duration,
        success: r.success,
        error: r.error,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/monitor/plugin-summary — Quick summary of plugin performance
// ────────────────────────────────────────────

/**
 * Returns high-level plugin metrics for dashboard display.
 *
 * Query params:
 * - hours: Time window in hours (default 24)
 */
router.get('/plugin-summary', async (ctx) => {
  const { hours } = ctx.query as { hours?: string }
  const hoursNum = parseInt(hours ?? '24', 10) || 24
  const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000)

  const [summary] = await PluginMetricModel.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        successCount: { $sum: { $cond: ['$success', 1, 0] } },
        failureCount: { $sum: { $cond: ['$success', 0, 1] } },
        avgDuration: { $avg: '$duration' },
        maxDuration: { $max: '$duration' },
        slowCalls: {
          $sum: { $cond: [{ $gte: ['$duration', 10000] }, 1, 0] },
        },
        uniquePlugins: { $addToSet: '$pluginId' },
      },
    },
    {
      $project: {
        _id: 0,
        totalCalls: 1,
        successCount: 1,
        failureCount: 1,
        successRate: {
          $round: [
            { $multiply: [{ $divide: ['$successCount', { $max: ['$totalCalls', 1] }] }, 100] },
            2,
          ],
        },
        avgDuration: { $round: ['$avgDuration', 2] },
        maxDuration: 1,
        slowCalls: 1,
        activePlugins: { $size: '$uniquePlugins' },
        periodHours: hoursNum,
      },
    },
  ])

  ctx.body = {
    success: true,
    data: summary ?? {
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgDuration: 0,
      maxDuration: 0,
      slowCalls: 0,
      activePlugins: 0,
      periodHours: hoursNum,
    },
  }
})

export default router

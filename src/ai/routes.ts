/**
 * AI API routes.
 *
 * Chat 流式对话通过 WebSocket（chat:send / chat:event），见 chatStreamHandler.ts。
 * POST /api/ai/publish         — Publish generated artifact
 * GET  /api/ai/conversations   — List conversations
 * GET  /api/ai/conversations/:id — Get conversation detail
 * DELETE /api/ai/conversations/:id — Delete a conversation
 */

import Router from '@koa/router'
import { v4 as uuidv4 } from 'uuid'
import { validate } from '../middleware/validate.js'
import { authMiddleware } from '../middleware/auth.js'
import { publishRequestSchema, behaviorRequestSchema } from './schemas/aiSchemas.js'
import { getInterruptedThread } from './chatStreamRunner.js'
import { adaptWidgets } from './services/schemaAdapter.js'
import {
  createConversation,
  getConversation,
  appendMessage,
  listConversations,
  deleteConversation,
  maybeGenerateSummary,
  searchConversations,
  updateMessageFeedback,
  AIConversationModel,
} from './services/conversationService.js'
import {
  createVersion,
  getVersions,
  getVersion,
} from './services/versionService.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { PublishedSchemaModel } from '../models/PublishedSchema.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../flow-models/FlowVersion.js'
import { PromptVersionModel } from './models/promptVersion.js'
import { promptOptimizer } from './services/promptOptimizer.js'
import type { AIMessage } from './graph/state.js'
import { recordBehavior, analyzeUserPreferences, getBehaviorStats } from './services/behaviorService.js'
import { getAvailableIndustries, getIndustryTemplates, type IndustryType } from './config/industryAgents.js'
import { semanticSearch } from './services/ragService.js'
import { ConfigModel } from '../models/Config.js'
import { logger } from '../utils/logger.js'

const router = new Router({ prefix: '/api/ai' })

// All AI routes require authentication
router.use(authMiddleware())

// ────────────────────────────────────────────
// Version diff computation
// ────────────────────────────────────────────

interface VersionDiffChange {
  type: 'add' | 'remove' | 'modify'
  elementId: string
  elementType: 'widget' | 'node' | 'edge'
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  summary: string
}

interface VersionDiff {
  changes: VersionDiffChange[]
  summary: {
    added: number
    removed: number
    modified: number
  }
}

function computeSchemaVersionDiff(
  oldWidgets: Record<string, unknown>[],
  newWidgets: Record<string, unknown>[],
): VersionDiff {
  const changes: VersionDiffChange[] = []
  let added = 0, removed = 0, modified = 0

  function indexWidgets(
    widgets: Record<string, unknown>[],
    parentPath = '',
  ): Map<string, { widget: Record<string, unknown>; path: string }> {
    const map = new Map<string, { widget: Record<string, unknown>; path: string }>()
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]
      const id = w.id as string
      const path = parentPath ? `${parentPath}[${i}]` : `[${i}]`
      if (id) map.set(id, { widget: w, path })
      if (Array.isArray(w.children)) {
        for (const [childId, entry] of indexWidgets(w.children as Record<string, unknown>[], path)) {
          map.set(childId, entry)
        }
      }
    }
    return map
  }

  const oldMap = indexWidgets(oldWidgets)
  const newMap = indexWidgets(newWidgets)

  for (const [id, { widget }] of oldMap) {
    if (!newMap.has(id)) {
      removed++
      changes.push({
        type: 'remove',
        elementId: id,
        elementType: 'widget',
        before: widget,
        summary: `删除了 ${widget.type ?? '未知'} 组件（${widget.label ?? id}）`,
      })
    }
  }

  for (const [id, { widget }] of newMap) {
    const oldEntry = oldMap.get(id)
    if (!oldEntry) {
      added++
      changes.push({
        type: 'add',
        elementId: id,
        elementType: 'widget',
        after: widget,
        summary: `新增了 ${widget.type ?? '未知'} 组件（${widget.label ?? id}）`,
      })
    } else {
      const SKIP_KEYS = new Set(['children', 'position', 'events', 'linkages', 'variables', 'lifecycle'])
      const allKeys = new Set([...Object.keys(oldEntry.widget), ...Object.keys(widget)])
      const changedProps = [...allKeys].filter(k => !SKIP_KEYS.has(k) && JSON.stringify(oldEntry.widget[k]) !== JSON.stringify(widget[k]))
      if (changedProps.length > 0) {
        modified++
        changes.push({
          type: 'modify',
          elementId: id,
          elementType: 'widget',
          before: oldEntry.widget,
          after: widget,
          summary: `修改了 ${widget.type ?? '未知'} 组件的 ${changedProps.join('、')} 属性`,
        })
      }
    }
  }

  return { changes, summary: { added, removed, modified } }
}

function computeFlowVersionDiff(
  oldFlow: Record<string, unknown>,
  newFlow: Record<string, unknown>,
): VersionDiff {
  const changes: VersionDiffChange[] = []
  let added = 0, removed = 0, modified = 0

  const oldNodes = (oldFlow.nodes ?? []) as Record<string, unknown>[]
  const newNodes = (newFlow.nodes ?? []) as Record<string, unknown>[]
  const oldEdges = (oldFlow.edges ?? []) as Record<string, unknown>[]
  const newEdges = (newFlow.edges ?? []) as Record<string, unknown>[]

  const oldNodeMap = new Map(oldNodes.map((n) => [n.id as string, n]))
  const newNodeMap = new Map(newNodes.map((n) => [n.id as string, n]))

  for (const [id, node] of oldNodeMap) {
    if (!newNodeMap.has(id)) {
      removed++
      changes.push({
        type: 'remove',
        elementId: id,
        elementType: 'node',
        before: node,
        summary: `删除了节点 "${(node.data as Record<string, unknown>)?.label ?? id}"`,
      })
    }
  }

  for (const [id, node] of newNodeMap) {
    const oldNode = oldNodeMap.get(id)
    if (!oldNode) {
      added++
      changes.push({
        type: 'add',
        elementId: id,
        elementType: 'node',
        after: node,
        summary: `新增了节点 "${(node.data as Record<string, unknown>)?.label ?? id}"`,
      })
    } else if (JSON.stringify(oldNode.data) !== JSON.stringify(node.data)) {
      modified++
      const oldD = (oldNode.data ?? {}) as Record<string, unknown>
      const newD = (node.data ?? {}) as Record<string, unknown>
      const changedKeys = Object.keys({ ...oldD, ...newD }).filter(k => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
      changes.push({
        type: 'modify',
        elementId: id,
        elementType: 'node',
        before: oldNode,
        after: node,
        summary: `修改了节点 "${(node.data as Record<string, unknown>)?.label ?? id}" 的 ${changedKeys.join('、')} 属性`,
      })
    }
  }

  const oldEdgeMap = new Map(oldEdges.map((e) => [e.id as string, e]))
  const newEdgeMap = new Map(newEdges.map((e) => [e.id as string, e]))

  for (const [id, edge] of oldEdgeMap) {
    if (!newEdgeMap.has(id)) {
      removed++
      changes.push({
        type: 'remove',
        elementId: id,
        elementType: 'edge',
        before: edge,
        summary: `删除了连线 ${id}`,
      })
    }
  }

  for (const [id, edge] of newEdgeMap) {
    const oldEdge = oldEdgeMap.get(id)
    if (!oldEdge) {
      added++
      changes.push({
        type: 'add',
        elementId: id,
        elementType: 'edge',
        after: edge,
        summary: `新增了连线 ${id}`,
      })
    } else if (JSON.stringify(oldEdge) !== JSON.stringify(edge)) {
      modified++
      changes.push({
        type: 'modify',
        elementId: id,
        elementType: 'edge',
        before: oldEdge,
        after: edge,
        summary: `修改了连线 ${id}`,
      })
    }
  }

  return { changes, summary: { added, removed, modified } }
}

function computeVersionDiff(
  oldContent: Record<string, unknown>[] | Record<string, unknown>,
  newContent: Record<string, unknown>[] | Record<string, unknown>,
  type: 'schema' | 'flow',
): VersionDiff {
  if (type === 'schema') {
    return computeSchemaVersionDiff(
      oldContent as Record<string, unknown>[],
      newContent as Record<string, unknown>[],
    )
  }
  return computeFlowVersionDiff(
    oldContent as Record<string, unknown>,
    newContent as Record<string, unknown>,
  )
}


// ────────────────────────────────────────────
// POST /api/ai/analyze-image — 图片纯视觉语义分析
// ────────────────────────────────────────────

router.post('/analyze-image', async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId
  const body = ctx.request.body as {
    image?: string
    documentId?: string
    prompt?: string
  }

  try {
    if (body.documentId?.trim()) {
      const { analyzeDocumentVision } = await import('./services/documentService.js')
      const result = await analyzeDocumentVision(body.documentId.trim(), {
        visionPrompt: body.prompt,
        userId: userId ? String(userId) : undefined,
      })
      if (!result) {
        ctx.status = 404
        ctx.body = { success: false, error: { message: 'Document not found' } }
        return
      }
      ctx.body = { success: true, data: { description: result.description } }
      return
    }

    if (!body.image?.trim()) {
      ctx.status = 400
      ctx.body = { success: false, error: { message: 'image or documentId is required' } }
      return
    }

    const { analyzeImagePayload } = await import('./services/fileService.js')
    const result = await analyzeImagePayload(body.image, body.prompt)
    ctx.body = { success: true, data: { description: result.description } }
  } catch (err) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Image analysis failed' },
    }
  }
})

// ────────────────────────────────────────────
// GET /api/ai/chat/interrupt/:threadId  (check HITL interrupt status)
// ────────────────────────────────────────────

router.get('/chat/interrupt/:threadId', async (ctx) => {
  const { threadId } = ctx.params
  const interrupted = getInterruptedThread(threadId)

  if (!interrupted) {
    ctx.body = { success: true, data: { hasInterrupt: false } }
    return
  }

  ctx.body = {
    success: true,
    data: {
      hasInterrupt: true,
      interruptType: (interrupted.interruptValue as Record<string, unknown>)?.type ?? 'unknown',
      message: (interrupted.interruptValue as Record<string, unknown>)?.message ?? '操作需要确认',
      data: (interrupted.interruptValue as Record<string, unknown>)?.data,
      timestamp: interrupted.timestamp,
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/chat/starter-prompts
// ────────────────────────────────────────────

const DEFAULT_STARTER_PROMPTS = [
  { icon: 'edit', text: '帮我生成一个用户注册表单', agent: 'editor' },
  { icon: 'list', text: '创建一个订单审批流程', agent: 'flow' },
  { icon: 'search', text: '搜索已有的表单模板', agent: 'auto' },
  { icon: 'setting', text: '设计一个系统配置页面', agent: 'editor' },
]

router.get('/chat/starter-prompts', async (ctx) => {
  try {
    const config = await ConfigModel.findOne({ key: 'ai.chat.starterPrompts', status: 'active' })
    if (config?.value) {
      const parsed = JSON.parse(config.value)
      if (Array.isArray(parsed) && parsed.length > 0) {
        ctx.body = { success: true, data: parsed }
        return
      }
    }
  } catch {
    // JSON parse error or DB issue — fall through to defaults
  }
  ctx.body = { success: true, data: DEFAULT_STARTER_PROMPTS }
})

// ────────────────────────────────────────────
// POST /api/ai/publish
// ────────────────────────────────────────────

router.post('/publish', validate(publishRequestSchema), async (ctx) => {
  const { conversationId, type, payload, target } = ctx.request.body as {
    conversationId: string
    type: 'schema' | 'flow'
    payload: Record<string, unknown>[] | Record<string, unknown>
    target?: { type: 'flow_node'; flowId: string; nodeId: string }
  }

  const convo = await getConversation(conversationId)
  if (!convo) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Conversation not found.' } }
    return
  }

  if (type === 'schema') {
    const widgets = payload as Record<string, unknown>[]
    const editId = uuidv4()
    const now = new Date()
    const version = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')

    const schema = await FormSchemaModel.create({
      editId,
      version,
      name: `AI Generated ${now.toISOString()}`,
      type: 'form',
      status: 'draft',
      json: widgets,
    })

    const publishId = uuidv4()
    await PublishedSchemaModel.create({
      sourceId: editId,
      publishId,
      name: schema.name,
      type: schema.type,
      json: schema.json,
      version: schema.version,
      publishedAt: now,
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        id: schema._id,
        publishId,
        ...(target ? { boundTo: { flowId: target.flowId, nodeId: target.nodeId } } : {}),
      },
    }
    return
  }

  // type === 'flow'
  if (type === 'flow') {
    const flowGraph = payload as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }
    const now = new Date()

    let definitionId = target?.flowId
    if (!definitionId) {
      const def = await FlowDefinitionModel.create({
        name: `AI Generated Flow ${now.toISOString()}`,
        description: '由 AI 生成的流程',
        status: 'draft',
        createdBy: 'ai-agent',
        permissions: { editors: [], launchers: [], viewers: [] },
      })
      definitionId = def._id
    }

    const pad = (n: number, len: number) => String(n).padStart(len, '0')
    const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

    const version = await FlowVersionModel.create({
      definitionId,
      version: nextVersion,
      graph: flowGraph,
    })

    await FlowDefinitionModel.findByIdAndUpdate(definitionId, {
      currentVersionId: version._id,
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        id: definitionId,
        versionId: version._id,
        version: nextVersion,
      },
    }
    return
  }

  ctx.status = 400
  ctx.body = {
    success: false,
    error: { message: `Unknown publish type: ${type}` },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/conversations
// ────────────────────────────────────────────

router.get('/conversations', async (ctx) => {
  const page = Math.max(1, parseInt(ctx.query.page as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.pageSize as string) || 20))

  const [conversations, total] = await Promise.all([
    AIConversationModel.find().sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    AIConversationModel.countDocuments(),
  ])

  ctx.body = {
    success: true,
    data: {
      items: conversations.map((c) => ({
        id: c._id,
        title: c.messages.length > 0
          ? c.messages[0].content.slice(0, 50)
          : 'New conversation',
        source: c.source,
        activeAgent: c.activeAgent,
        version: c.version,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/conversations/search
// ────────────────────────────────────────────

/**
 * GET /api/ai/conversations/search — Search and filter conversations
 *
 * Query params:
 * - keyword: Search keyword (matches message content, case-insensitive regex)
 * - startDate: Filter by created date >= startDate (ISO 8601)
 * - endDate: Filter by created date <= endDate (ISO 8601)
 * - source: Filter by conversation source (editor | flow | standalone)
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20, max 50)
 */
router.get("/conversations/search", async (ctx) => {
  const { keyword, startDate, endDate, source, page: pageStr, pageSize: pageSizeStr } = ctx.query as {
    keyword?: string
    startDate?: string
    endDate?: string
    source?: string
    page?: string
    pageSize?: string
  }

  const page = Math.max(parseInt(pageStr ?? "1", 10) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(pageSizeStr ?? "20", 10) || 20, 1), 50)

  const result = await searchConversations({
    keyword,
    startDate,
    endDate,
    source,
    page,
    pageSize,
  })

  ctx.body = {
    success: true,
    data: {
      conversations: result.conversations.map((c) => ({
        id: c._id,
        title: c.messages.length > 0
          ? c.messages[0].content.slice(0, 50)
          : "New conversation",
        source: c.source,
        activeAgent: c.activeAgent,
        version: c.version,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
  }
})

// ────────────────────────────────────────────
// GET /api/ai/mention/search/:type
// ────────────────────────────────────────────

/**
 * GET /api/ai/mention/search/:type — Search resources for @mention autocomplete
 *
 * Params:
 * - type: 'schema' | 'flow' | 'widget'
 * Query:
 * - q: search keyword
 * - limit: max results (default 10)
 */
router.get('/mention/search/:type', async (ctx) => {
  const { type } = ctx.params
  const { q, limit: limitStr } = ctx.query as { q?: string; limit?: string }
  const limit = Math.min(Math.max(parseInt(limitStr ?? '10', 10) || 10, 1), 50)
  const keyword = (q ?? '').trim()

  if (!['schema', 'flow', 'widget'].includes(type)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'type must be schema, flow, or widget' } }
    return
  }

  const regex = keyword ? { $regex: keyword, $options: 'i' } : undefined

  if (type === 'schema') {
    const filter: Record<string, unknown> = {}
    if (regex) filter.name = regex
    const docs = await FormSchemaModel.find(filter)
      .select('_id name type updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean() as Record<string, unknown>[]
    ctx.body = {
      success: true,
      data: docs.map((d) => ({
        id: d._id,
        type: 'schema',
        name: d.name,
        description: d.type,
        updatedAt: d.updatedAt,
      })),
    }
    return
  }

  if (type === 'flow') {
    const filter: Record<string, unknown> = {}
    if (regex) filter.name = regex
    const docs = await FlowDefinitionModel.find(filter)
      .select('_id name description updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean() as Record<string, unknown>[]
    ctx.body = {
      success: true,
      data: docs.map((d) => ({
        id: d._id,
        type: 'flow',
        name: d.name,
        description: d.description,
        updatedAt: d.updatedAt,
      })),
    }
    return
  }

  // type === 'widget' — search schemas and extract widget labels
  const schemas = await FormSchemaModel.find({})
    .select('json name')
    .lean() as Record<string, unknown>[]

  const widgets: Array<{ id: string; type: string; name: string; description?: string }> = []
  const seen = new Set<string>()

  for (const schema of schemas) {
    const json = schema.json as Record<string, unknown>[] | undefined
    if (!Array.isArray(json)) continue
    for (const widget of json) {
      const wId = widget.id as string
      const wLabel = (widget.label as string) ?? (widget.field as string) ?? (widget.type as string) ?? ''
      const wType = (widget.type as string) ?? 'unknown'
      if (seen.has(wId)) continue
      if (keyword && !wLabel.toLowerCase().includes(keyword.toLowerCase()) && !wType.toLowerCase().includes(keyword.toLowerCase())) continue
      seen.add(wId)
      widgets.push({
        id: wId,
        type: 'widget',
        name: wLabel || wType,
        description: `类型: ${wType}`,
      })
      if (widgets.length >= limit) break
    }
    if (widgets.length >= limit) break
  }

  ctx.body = {
    success: true,
    data: widgets,
  }
})

// ────────────────────────────────────────────
// GET /api/ai/conversations/:id
// ────────────────────────────────────────────

router.get('/conversations/:id', async (ctx) => {
  const { id } = ctx.params
  const convo = await getConversation(id)
  if (!convo) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Conversation not found.' } }
    return
  }
  ctx.body = {
    success: true,
    data: {
      id: convo._id,
      title: convo.messages.length > 0
        ? convo.messages[0].content.slice(0, 50)
        : 'New conversation',
      source: convo.source,
      activeAgent: convo.activeAgent,
      version: convo.version,
      messages: convo.messages.map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        tip: m.tip,
        toolCalls: m.toolCalls,
        schema: m.schema,
        flow: m.flow,
        timestamp: m.timestamp,
        feedback: m.feedback,
      })),
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
    },
  }
})

// ────────────────────────────────────────────
// DELETE /api/ai/conversations/:id
// ────────────────────────────────────────────

router.delete('/conversations/:id', async (ctx) => {
  const { id } = ctx.params
  const deleted = await deleteConversation(id)
  if (!deleted) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Conversation not found.' } }
    return
  }
  ctx.body = { success: true }
})

// ────────────────────────────────────────────
// Message Feedback API
// ────────────────────────────────────────────

/**
 * POST /api/ai/messages/:id/feedback
 *
 * Submit feedback (positive/negative) for a message.
 */
router.post('/messages/:id/feedback', async (ctx) => {
  const { id: messageId } = ctx.params
  const { feedback, comment } = ctx.request.body as { feedback: 'positive' | 'negative'; comment?: string }

  if (!feedback || !['positive', 'negative'].includes(feedback)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid feedback type. Must be "positive" or "negative".' } }
    return
  }

  // Find the conversation containing this message
  const convo = await AIConversationModel.findOne({ 'messages._id': messageId })
  if (!convo) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Message not found.' } }
    return
  }

  const updated = await updateMessageFeedback(convo._id, messageId, feedback, comment)
  if (!updated) {
    ctx.status = 500
    ctx.body = { success: false, error: { message: 'Failed to update feedback.' } }
    return
  }

  ctx.body = { success: true, data: { messageId, feedback, comment } }
})

// ────────────────────────────────────────────
// Version History API
// ────────────────────────────────────────────

/**
 * GET /api/ai/conversations/:id/versions
 *
 * List all versions for a conversation (for version history panel).
 */
router.get('/conversations/:id/versions', async (ctx) => {
  const { id } = ctx.params
  const versions = await getVersions(id)

  ctx.body = {
    success: true,
    data: versions.map((v) => ({
      id: v._id,
      version: v.version,
      type: v.type,
      description: v.description,
      createdAt: v.createdAt,
    })),
  }
})

/**
 * GET /api/ai/versions/compare
 *
 * Compare two versions side by side.
 *
 * Query params:
 * - v1: First version ID (required)
 * - v2: Second version ID (required)
 *
 * Returns both versions' content and a structural diff.
 */
router.get('/versions/compare', async (ctx) => {
  const { v1, v2 } = ctx.query as { v1?: string; v2?: string }

  if (!v1 || !v2) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'v1 and v2 query parameters are required' } }
    return
  }

  const [version1, version2] = await Promise.all([getVersion(v1), getVersion(v2)])

  if (!version1) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: `Version ${v1} not found.` } }
    return
  }
  if (!version2) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: `Version ${v2} not found.` } }
    return
  }

  if (version1.type !== version2.type) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Cannot compare versions of different types (schema vs flow).' } }
    return
  }

  // Compute structural diff
  const diff = computeVersionDiff(version1.content, version2.content, version1.type)

  ctx.body = {
    success: true,
    data: {
      v1: {
        id: version1._id,
        version: version1.version,
        type: version1.type,
        description: version1.description,
        createdAt: version1.createdAt,
      },
      v2: {
        id: version2._id,
        version: version2.version,
        type: version2.type,
        description: version2.description,
        createdAt: version2.createdAt,
      },
      diff,
    },
  }
})

/**
 * GET /api/ai/versions/:versionId
 *
 * Get a specific version's content.
 */
router.get('/versions/:versionId', async (ctx) => {
  const { versionId } = ctx.params
  const version = await getVersion(versionId)

  if (!version) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Version not found.' } }
    return
  }

  ctx.body = {
    success: true,
    data: {
      id: version._id,
      conversationId: version.conversationId,
      version: version.version,
      type: version.type,
      content: version.content,
      description: version.description,
      createdAt: version.createdAt,
    },
  }
})

/**
 * POST /api/ai/conversations/:id/rollback
 *
 * Rollback to a specific version. Restores the version content
 * as the current schema/flow and sends it back.
 */
router.post('/conversations/:id/rollback', async (ctx) => {
  const { id } = ctx.params
  const { versionId } = ctx.request.body as { versionId: string }

  if (!versionId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'versionId is required' } }
    return
  }

  const convo = await getConversation(id)
  if (!convo) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Conversation not found.' } }
    return
  }

  const version = await getVersion(versionId)
  if (!version || version.conversationId !== id) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Version not found in this conversation.' } }
    return
  }

  // Create a new version from the rollback target
  const newVersion = await createVersion({
    conversationId: id,
    messageId: 'rollback',
    type: version.type,
    content: version.content,
    description: `回滚到版本 v${version.version}`,
  })

  ctx.body = {
    success: true,
    data: {
      id: newVersion._id,
      version: newVersion.version,
      type: newVersion.type,
      content: newVersion.content,
      description: newVersion.description,
      rollbackFrom: versionId,
    },
  }
})


// ────────────────────────────────────────────
// RAG Semantic Search API
// ────────────────────────────────────────────

/**
 * GET /api/ai/rag/search — Semantic search for schemas via vector embeddings
 *
 * Query params:
 * - query: Natural language search query (required)
 * - limit: Max results (default 5)
 * - type: Filter by schema type (form | search_list)
 */
router.get('/rag/search', async (ctx) => {
  const { query, limit: limitStr, type } = ctx.query as {
    query?: string
    limit?: string
    type?: string
  }

  if (!query || query.trim().length === 0) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'query parameter is required' } }
    return
  }

  const limit = Math.min(Math.max(parseInt(limitStr ?? '5', 10) || 5, 1), 20)
  const schemaType = type === 'form' || type === 'search_list' ? type : undefined

  const results = await semanticSearch(query.trim(), { limit, type: schemaType, minScore: 5 })

  ctx.body = {
    success: true,
    data: {
      total: results.length,
      schemas: results.map((r) => ({
        id: r.schemaId,
        editId: r.editId,
        name: r.name,
        type: r.type,
        score: r.score,
        widgetTypes: r.metadata.widgetTypes,
        fieldNames: r.metadata.fieldNames,
        labels: r.metadata.labels,
        description: r.metadata.description,
      })),
    },
  }
})

// ────────────────────────────────────────────
// Industry Agent API
// ────────────────────────────────────────────

/**
 * GET /api/ai/industries
 * List available industry agent configurations.
 */
router.get('/industries', async (ctx) => {
  const industries = getAvailableIndustries()
  ctx.body = {
    success: true,
    data: industries,
  }
})

/**
 * GET /api/ai/industries/:industry/templates
 * Get templates for a specific industry.
 */
router.get('/industries/:industry/templates', async (ctx) => {
  const { industry } = ctx.params
  const { type } = ctx.query as { type?: string }

  const validIndustries = ['medical', 'finance', 'education']
  if (!validIndustries.includes(industry)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: `Invalid industry: ${industry}. Must be one of: ${validIndustries.join(', ')}` } }
    return
  }

  const templates = getIndustryTemplates(
    industry as IndustryType,
    type === 'form' || type === 'flow' ? type : undefined,
  )

  ctx.body = {
    success: true,
    data: {
      industry,
      total: templates.length,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
      })),
    },
  }
})


// ────────────────────────────────────────────
// User Behavior Learning
// ────────────────────────────────────────────

/**
 * POST /api/ai/behavior — Record user behavior
 *
 * Track user actions for preference learning.
 */
router.post('/behavior', authMiddleware(), validate(behaviorRequestSchema), async (ctx) => {
  const { action, target, data } = ctx.request.body as {
    action: 'use_component' | 'set_property' | 'create_schema' | 'generate_ai'
    target?: string
    data?: Record<string, unknown>
  }

  const userId = ctx.state.user.id

  await recordBehavior({ userId, action, target, data })

  ctx.body = { success: true }
})

/**
 * POST /api/ai/behavior/batch — Record multiple behaviors
 *
 * Efficiently record multiple user actions at once.
 */
router.post('/behavior/batch', authMiddleware(), async (ctx) => {
  const { behaviors } = ctx.request.body as {
    behaviors: Array<{
      action: 'use_component' | 'set_property' | 'create_schema' | 'generate_ai'
      target?: string
      data?: Record<string, unknown>
    }>
  }

  if (!Array.isArray(behaviors) || behaviors.length === 0) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'behaviors array is required' } }
    return
  }

  if (behaviors.length > 50) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Maximum 50 behaviors per batch' } }
    return
  }

  const userId = ctx.state.user.id

  for (const behavior of behaviors) {
    await recordBehavior({
      userId,
      action: behavior.action,
      target: behavior.target,
      data: behavior.data,
    })
  }

  ctx.body = { success: true, data: { recorded: behaviors.length } }
})

/**
 * GET /api/ai/behavior/preferences — Get user preferences
 *
 * Analyze and return user behavior preferences.
 */
router.get('/behavior/preferences', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user.id

  const preferences = await analyzeUserPreferences(userId)

  ctx.body = {
    success: true,
    data: preferences,
  }
})

/**
 * GET /api/ai/behavior/stats — Get user behavior statistics
 *
 * Returns activity statistics for the current user.
 */
router.get('/behavior/stats', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user.id

  const stats = await getBehaviorStats(userId)

  ctx.body = {
    success: true,
    data: stats,
  }
})

// ────────────────────────────────────────────
// Editor/Flow 双向同步 API
// ────────────────────────────────────────────

/**
 * GET /api/ai/sync/schema/:schemaId/flows
 *
 * 查找引用了指定 Schema 的所有流程节点（Schema → Flow 反向查询）
 */
router.get('/sync/schema/:schemaId/flows', async (ctx) => {
  const { schemaId } = ctx.params

  const schema = await FormSchemaModel.findById(schemaId)
    .select('_id name type version')
    .lean() as Record<string, unknown> | null

  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Schema not found' } }
    return
  }

  const versions = await FlowVersionModel.find({
    'graph.nodes.data.formSchemaId': schemaId,
  })
    .select('_id definitionId version graph.nodes')
    .lean() as unknown as Array<Record<string, unknown>>

  const refs: Array<{
    flowId: string
    flowName: string
    versionId: string
    flowVersion: string
    nodeId: string
    nodeLabel: string
    bpmnType: string
    formMode: string
  }> = []

  for (const ver of versions) {
    const graph = ver.graph as Record<string, unknown> | undefined
    const def = await FlowDefinitionModel.findById(ver.definitionId)
      .select('_id name')
      .lean() as Record<string, unknown> | null

    const nodes = (graph?.nodes ?? []) as Array<Record<string, unknown>>
    for (const node of nodes) {
      const data = node.data as Record<string, unknown> | undefined
      if (data?.formSchemaId === schemaId) {
        refs.push({
          flowId: ver.definitionId as string,
          flowName: (def?.name as string) ?? 'Unknown',
          versionId: ver._id as string,
          flowVersion: ver.version as string,
          nodeId: node.id as string,
          nodeLabel: (data.label as string) ?? (node.id as string),
          bpmnType: (data.bpmnType as string) ?? 'unknown',
          formMode: (data.formMode as string) ?? 'edit',
        })
      }
    }
  }

  ctx.body = {
    success: true,
    data: {
      schema: { id: schema._id, name: schema.name, type: schema.type, version: schema.version },
      references: refs,
      total: refs.length,
    },
  }
})

/**
 * GET /api/ai/sync/flow/:flowId/node/:nodeId/schema
 *
 * 获取流程节点绑定的表单 Schema 详情（Flow → Schema 正向查询）
 */
router.get('/sync/flow/:flowId/node/:nodeId/schema', async (ctx) => {
  const { flowId, nodeId } = ctx.params

  const version = await FlowVersionModel.findOne({ definitionId: flowId })
    .sort({ version: -1 })
    .lean() as Record<string, unknown> | null

  if (!version?.graph) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Flow has no version' } }
    return
  }

  const graph = version.graph as Record<string, unknown>
  const nodes = (graph.nodes ?? []) as Array<Record<string, unknown>>
  const node = nodes.find((n) => n.id === nodeId)

  if (!node) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Node not found' } }
    return
  }

  const data = node.data as Record<string, unknown> | undefined
  const formSchemaId = data?.formSchemaId as string | undefined

  if (!formSchemaId) {
    ctx.body = {
      success: true,
      data: { nodeId, hasSchema: false },
    }
    return
  }

  const schema = await FormSchemaModel.findById(formSchemaId)
    .select('_id name type version json')
    .lean() as Record<string, unknown> | null

  ctx.body = {
    success: true,
    data: {
      nodeId,
      hasSchema: true,
      formSchemaId,
      formPublishId: data?.formPublishId,
      formVersion: data?.formVersion,
      formMode: data?.formMode,
      schema: schema
        ? { id: schema._id, name: schema.name, type: schema.type, version: schema.version, json: schema.json }
        : null,
    },
  }
})

/**
 * POST /api/ai/sync/schema/:schemaId/update-flows
 *
 * 当 Schema 更新时，同步更新所有引用该 Schema 的流程节点的 formVersion。
 * 可选地传入 targetFlowId 只更新指定流程。
 */
router.post('/sync/schema/:schemaId/update-flows', async (ctx) => {
  const { schemaId } = ctx.params
  const { targetFlowId } = ctx.request.body as { targetFlowId?: string }

  const schema = await FormSchemaModel.findById(schemaId)
    .select('_id editId name version')
    .lean() as Record<string, unknown> | null

  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Schema not found' } }
    return
  }

  const { PublishedSchemaModel } = await import('../models/PublishedSchema.js')
  const published = await PublishedSchemaModel.findOne({ sourceId: schema.editId })
    .sort({ publishedAt: -1 })
    .select('publishId version')
    .lean() as Record<string, unknown> | null

  const publishId = (published?.publishId as string) ?? ''

  // 查找引用该 Schema 的 FlowVersion
  const filter: Record<string, unknown> = {
    'graph.nodes.data.formSchemaId': schemaId,
  }
  if (targetFlowId) {
    filter.definitionId = targetFlowId
  }

  const versions = await FlowVersionModel.find(filter).lean() as unknown as Array<Record<string, unknown>>
  const updated: Array<{ flowId: string; nodeId: string; newVersion: string }> = []

  for (const ver of versions) {
    const graph = ver.graph as Record<string, unknown> | undefined
    const nodes = (graph?.nodes ?? []) as Array<Record<string, unknown>>
    let changed = false

    const updatedNodes = nodes.map((node) => {
      const data = node.data as Record<string, unknown> | undefined
      if (data?.formSchemaId === schemaId) {
        changed = true
        return {
          ...node,
          data: {
            ...data,
            formPublishId: publishId,
            formVersion: schema.version,
          },
        }
      }
      return node
    })

    if (changed) {
      const { FlowDefinitionModel } = await import('../flow-models/FlowDefinition.js')

      const now = new Date()
      const pad = (n: number, len: number) => String(n).padStart(len, '0')
      const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

      const newVersion = await FlowVersionModel.create({
        definitionId: ver.definitionId,
        version: nextVersion,
        graph: {
          nodes: updatedNodes,
          edges: (graph?.edges as unknown[]) ?? [],
        },
      })

      await FlowDefinitionModel.findByIdAndUpdate(ver.definitionId, {
        currentVersionId: newVersion._id,
      })

      // 收集更新信息
      for (const node of updatedNodes) {
        const data = node.data as Record<string, unknown> | undefined
        if (data?.formSchemaId === schemaId) {
          updated.push({
            flowId: ver.definitionId as string,
            nodeId: node.id as string,
            newVersion: nextVersion,
          })
        }
      }
    }
  }

  ctx.body = {
    success: true,
    data: {
      schemaId,
      schemaVersion: schema.version,
      publishId,
      updatedFlows: updated,
      total: updated.length,
    },
  }
})

/**
 * POST /api/ai/sync/bind
 *
 * 将 Schema 绑定到 Flow 节点的通用 API（前端直接调用）
 */
router.post('/sync/bind', async (ctx) => {
  const { schemaId, flowId, nodeId, formMode } = ctx.request.body as {
    schemaId: string
    flowId: string
    nodeId: string
    formMode?: 'edit' | 'view'
  }

  if (!schemaId || !flowId || !nodeId) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'schemaId, flowId, nodeId are required' } }
    return
  }

  const schema = await FormSchemaModel.findById(schemaId)
    .select('_id editId name version')
    .lean() as Record<string, unknown> | null

  if (!schema) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Schema not found' } }
    return
  }

  const { PublishedSchemaModel } = await import('../models/PublishedSchema.js')
  const published = await PublishedSchemaModel.findOne({ sourceId: schema.editId })
    .sort({ publishedAt: -1 })
    .select('publishId version')
    .lean() as Record<string, unknown> | null

  const publishId = (published?.publishId as string) ?? ''
  const version = (published?.version as string) ?? (schema.version as string) ?? ''

  const flowVersion = await FlowVersionModel.findOne({ definitionId: flowId })
    .sort({ version: -1 })
    .lean() as Record<string, unknown> | null

  if (!flowVersion?.graph) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Flow has no version' } }
    return
  }

  const flowGraph = flowVersion.graph as Record<string, unknown>
  const nodes = (flowGraph.nodes ?? []) as Array<Record<string, unknown>>
  const nodeIndex = nodes.findIndex((n) => n.id === nodeId)

  if (nodeIndex === -1) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Node not found' } }
    return
  }

  const nodeData = nodes[nodeIndex].data as Record<string, unknown>
  if (nodeData.bpmnType !== 'userTask') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Only userTask nodes can bind schemas' } }
    return
  }

  const updatedNodes = [...nodes]
  updatedNodes[nodeIndex] = {
    ...updatedNodes[nodeIndex],
    data: {
      ...nodeData,
      formSchemaId: schemaId,
      formPublishId: publishId,
      formVersion: version,
      formMode: formMode ?? (nodeData.formMode as string) ?? 'edit',
    },
  }

  const now = new Date()
  const pad = (n: number, len: number) => String(n).padStart(len, '0')
  const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

  const newVersion = await FlowVersionModel.create({
    definitionId: flowId,
    version: nextVersion,
    graph: {
      nodes: updatedNodes,
      edges: (flowGraph.edges as unknown[]) ?? [],
    },
  })

  await FlowDefinitionModel.findByIdAndUpdate(flowId, {
    currentVersionId: newVersion._id,
  })

  ctx.status = 201
  ctx.body = {
    success: true,
    data: {
      flowId,
      nodeId,
      schemaId,
      publishId,
      formVersion: version,
      flowVersionId: newVersion._id,
      flowVersion: nextVersion,
    },
  }
})

export default router

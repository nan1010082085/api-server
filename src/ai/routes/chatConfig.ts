/**
 * Chat configuration API routes.
 *
 * GET  /api/ai/chat-config — Get chat UI configuration (starter prompts, etc.)
 * GET  /api/ai/prompt-templates — List prompt templates
 * POST /api/ai/prompt-templates — Create prompt template
 * PUT  /api/ai/prompt-templates/:id — Update prompt template
 * DELETE /api/ai/prompt-templates/:id — Delete prompt template
 */

import Router from '@koa/router'
import { ConfigModel } from '../../models/Config.js'
import { authMiddleware } from '../../middleware/auth.js'

const router = new Router({ prefix: '/api/ai' })

// ────────────────────────────────────────────
// Default starter prompts (hardcoded fallback)
// ────────────────────────────────────────────

const DEFAULT_STARTER_PROMPTS = [
  { icon: 'edit', text: '帮我创建一个表单', agent: 'editor' },
  { icon: 'connection', text: '设计一个审批流程', agent: 'flow' },
  { icon: 'search', text: '搜索知识库', agent: 'auto' },
]

// ────────────────────────────────────────────
// GET /api/ai/chat-config
// ────────────────────────────────────────────

router.get('/chat-config', async (ctx) => {
  let starterPrompts = DEFAULT_STARTER_PROMPTS

  try {
    const config = await ConfigModel.findOne({ key: 'ai.chat.starterPrompts', status: 'active' })
    if (config?.value) {
      const parsed = JSON.parse(config.value)
      if (Array.isArray(parsed) && parsed.length > 0) {
        starterPrompts = parsed
      }
    }
  } catch {
    // JSON parse error or DB issue — fall through to defaults
  }

  ctx.body = { starterPrompts }
})

// ────────────────────────────────────────────
// Prompt Templates CRUD (per-user)
// ────────────────────────────────────────────

interface PromptTemplate {
  id: string
  title: string
  content: string
  category: string
  createdAt: string
}

function getConfigKey(userId: string): string {
  return `ai.promptTemplates.${userId}`
}

/**
 * GET /api/ai/prompt-templates
 * 获取当前用户的 prompt 模板列表
 */
router.get('/prompt-templates', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId ?? ''
  const config = await ConfigModel.findOne({ key: getConfigKey(userId), status: 'active' })
  let templates: PromptTemplate[] = []
  if (config?.value) {
    try { templates = JSON.parse(config.value) } catch { /* ignore */ }
  }
  ctx.body = { templates }
})

/**
 * POST /api/ai/prompt-templates
 * 创建 prompt 模板
 */
router.post('/prompt-templates', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId ?? ''
  const body = ctx.request.body as { title?: string; content?: string; category?: string }
  if (!body.title?.trim() || !body.content?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'title 和 content 必填' } }
    return
  }

  const configKey = getConfigKey(userId)
  const config = await ConfigModel.findOne({ key: configKey, status: 'active' })
  let templates: PromptTemplate[] = []
  if (config?.value) {
    try { templates = JSON.parse(config.value) } catch { /* ignore */ }
  }

  const newTemplate: PromptTemplate = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: body.title.trim(),
    content: body.content.trim(),
    category: body.category?.trim() ?? '通用',
    createdAt: new Date().toISOString(),
  }
  templates.push(newTemplate)

  await ConfigModel.updateOne(
    { key: configKey },
    { $set: { value: JSON.stringify(templates), status: 'active', tenantId: ctx.state.user?.tenantId ?? '000000' } },
    { upsert: true },
  )
  ctx.body = { success: true, data: newTemplate }
})

/**
 * PUT /api/ai/prompt-templates/:id
 * 更新 prompt 模板
 */
router.put('/prompt-templates/:id', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId ?? ''
  const id = ctx.params.id
  const body = ctx.request.body as { title?: string; content?: string; category?: string }

  const configKey = getConfigKey(userId)
  const config = await ConfigModel.findOne({ key: configKey, status: 'active' })
  if (!config?.value) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '模板不存在' } }
    return
  }

  let templates: PromptTemplate[] = []
  try { templates = JSON.parse(config.value) } catch { /* ignore */ }
  const idx = templates.findIndex((t) => t.id === id)
  if (idx === -1) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '模板不存在' } }
    return
  }

  if (body.title?.trim()) templates[idx].title = body.title.trim()
  if (body.content?.trim()) templates[idx].content = body.content.trim()
  if (body.category?.trim()) templates[idx].category = body.category.trim()

  await ConfigModel.updateOne({ key: configKey }, { $set: { value: JSON.stringify(templates) } })
  ctx.body = { success: true, data: templates[idx] }
})

/**
 * DELETE /api/ai/prompt-templates/:id
 * 删除 prompt 模板
 */
router.delete('/prompt-templates/:id', authMiddleware(), async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId ?? ''
  const id = ctx.params.id

  const configKey = getConfigKey(userId)
  const config = await ConfigModel.findOne({ key: configKey, status: 'active' })
  if (!config?.value) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '模板不存在' } }
    return
  }

  let templates: PromptTemplate[] = []
  try { templates = JSON.parse(config.value) } catch { /* ignore */ }
  const filtered = templates.filter((t) => t.id !== id)
  if (filtered.length === templates.length) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '模板不存在' } }
    return
  }

  await ConfigModel.updateOne({ key: configKey }, { $set: { value: JSON.stringify(filtered) } })
  ctx.body = { success: true }
})

export default router

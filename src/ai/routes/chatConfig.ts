/**
 * Chat configuration API routes.
 *
 * GET /api/ai/chat-config — Get chat UI configuration (starter prompts, etc.)
 */

import Router from '@koa/router'
import { ConfigModel } from '../../models/Config.js'

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

export default router

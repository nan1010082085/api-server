/**
 * Debug Routes — 路由调试 API
 */

import Router from '@koa/router'
import { authMiddleware } from '../../middleware/auth.js'
import { resolveIntent } from '../runtime/intentRouter.js'
import { getPluginRegistry } from '../plugins/index.js'
import { logger } from '../../utils/logger.js'

const router = new Router({ prefix: '/api/ai/debug' })

// 所有调试路由需要认证
router.use(authMiddleware)

/**
 * POST /api/ai/debug/route
 * 测试消息路由
 */
router.post('/route', async (ctx) => {
  const { message, contextSource, enableMultiIntentChain } = ctx.request.body as {
    message?: string
    contextSource?: string
    enableMultiIntentChain?: boolean
  }

  if (!message?.trim()) {
    ctx.status = 400
    ctx.body = { error: 'message is required' }
    return
  }

  try {
    const registry = getPluginRegistry()

    const result = await resolveIntent(
      {
        message: message.trim(),
        contextSource,
        enableMultiIntentChain: enableMultiIntentChain ?? true,
      },
      { registry },
    )

    // 获取所有匹配的专家
    const matchedExperts = registry.matchExpertsByRouting({
      text: message.trim().toLowerCase(),
      contextSource,
      runtime: 'langgraph',
    })

    ctx.body = {
      expertId: result.expertId,
      legacyAgentKey: result.legacyAgentKey,
      chainPreview: result.chainPreview,
      routeReason: result.routeReason,
      matchedExperts: matchedExperts.map((e) => ({
        id: e.id,
        label: e.label,
        legacyAgentKey: e.legacyAgentKey,
        routingKeywords: e.routing?.keywords ?? [],
        routingContextSources: e.routing?.contextSources ?? [],
      })),
    }
  } catch (err) {
    logger.error({ msg: 'Route debug failed', error: String(err) })
    ctx.status = 500
    ctx.body = { error: 'Route debug failed' }
  }
})

/**
 * GET /api/ai/debug/experts
 * 获取所有专家及其路由配置
 */
router.get('/experts', async (ctx) => {
  try {
    const registry = getPluginRegistry()
    const experts = registry.listExperts()

    ctx.body = experts.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      legacyAgentKey: e.legacyAgentKey,
      routingKeywords: e.routing?.keywords ?? [],
      routingContextSources: e.routing?.contextSources ?? [],
      tools: e.tools ?? [],
      skills: e.skills ?? [],
    }))
  } catch (err) {
    logger.error({ msg: 'List experts failed', error: String(err) })
    ctx.status = 500
    ctx.body = { error: 'List experts failed' }
  }
})

export default router

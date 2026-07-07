import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { getPluginRegistry } from './plugins/index.js'
import { PLUGIN_PACK_LAYERS } from './plugins/pluginPack.js'
import { writePluginLocalJson, type PluginLocalLayer } from './plugins/pluginLocalWrite.js'

const router = new Router({ prefix: '/api/ai/plugins' })

router.use(authMiddleware())

router.get('/', async (ctx) => {
  const registry = getPluginRegistry()
  ctx.body = {
    success: true,
    data: {
      experts: registry.listExperts().map((e) => ({
        id: e.id,
        label: e.label,
        description: e.description,
        legacyAgentKey: e.legacyAgentKey,
        tools: e.tools,
        skills: e.skills ?? [],
        routing: e.routing,
        runtime: e.runtime,
      })),
      skills: registry.listSkills().map((s) => ({
        id: s.id,
        label: s.label,
        tools: s.tools ?? [],
      })),
      tools: registry.listToolDeclarations(),
      mcpServers: registry.listMcpServers().map((s) => ({
        id: s.id,
        transport: s.transport,
        namespace: s.namespace,
        builtin: s.builtin,
      })),
    },
  }
})

/** 写入 plugins/local/{layer}/{file}.json 并热重载（开发/租户定制） */
router.put('/local/:layer/:file', async (ctx) => {
  const layer = ctx.params.layer as PluginLocalLayer
  if (!PLUGIN_PACK_LAYERS.includes(layer)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid layer', code: 'invalid_layer' } }
    return
  }

  const payload = ctx.request.body
  if (!payload || typeof payload !== 'object') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'JSON body required', code: 'invalid_body' } }
    return
  }

  try {
    const result = await writePluginLocalJson(layer, ctx.params.file, payload)
    ctx.body = { success: true, data: result }
  } catch (err) {
    ctx.status = 422
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Write failed', code: 'write_failed' },
    }
  }
})

export default router

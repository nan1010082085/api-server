import Router from '@koa/router'
import { authMiddleware } from '../../middleware/auth.js'
import { getPluginRegistry } from './plugins/index.js'

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

export default router

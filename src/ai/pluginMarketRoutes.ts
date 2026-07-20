/**
 * Plugin marketplace API — FE paths under /api/plugins/market
 *
 * GET  /api/plugins/market
 * POST /api/plugins/market/:id/install
 * POST /api/plugins/market/:id/uninstall
 * POST /api/plugins/market/install-from-url
 */

import Router from '@koa/router'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { isValidObjectId } from '../utils/objectId.js'
import { PluginModel } from './models/plugin.js'
import { UserPluginModel } from './models/userPlugin.js'
import { getPluginRegistry } from './plugins/index.js'
import {
  assertExternalExpertIdAllowed,
  buildUserPluginInstallConfig,
  fetchPluginJsonFromUrl,
  installFromUrlBodySchema,
  parseExternalPluginJson,
  PluginMarketError,
} from './pluginMarketInstall.js'

const router = new Router({ prefix: '/api/plugins' })
router.use(authMiddleware())

export type MarketCategory = 'expert' | 'tool' | 'mcp' | 'skill' | 'workflow'

export interface PluginMarketItem {
  id: string
  name: string
  description: string
  category: MarketCategory
  version: string
  author: string
  icon: string
  downloads: number
  installed: boolean
  tags: string[]
}

function mapDbCategory(category: string): MarketCategory {
  switch (category) {
    case 'development':
      return 'tool'
    case 'productivity':
      return 'skill'
    case 'business':
      return 'workflow'
    default:
      return 'expert'
  }
}

async function installedPluginIds(userId: string): Promise<Set<string>> {
  const rows = await UserPluginModel.find({ userId, enabled: true }).select('pluginId').lean()
  return new Set(rows.map((r) => r.pluginId))
}

function registryMarketItems(installed: Set<string>): PluginMarketItem[] {
  const registry = getPluginRegistry()
  const experts = registry.listExperts().map((e) => ({
    id: e.id,
    name: e.label,
    description: e.description ?? '',
    category: 'expert' as const,
    version: '1.0.0',
    author: 'platform',
    icon: '',
    downloads: 0,
    installed: installed.has(e.id),
    tags: e.tools?.slice(0, 5) ?? [],
  }))
  const skills = registry.listSkills().map((s) => ({
    id: s.id,
    name: s.label,
    description: '',
    category: 'skill' as const,
    version: '1.0.0',
    author: 'platform',
    icon: '',
    downloads: 0,
    installed: installed.has(s.id),
    tags: s.tools?.slice(0, 5) ?? [],
  }))
  return [...experts, ...skills]
}

router.get('/market', async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const installed = await installedPluginIds(user.id)

  const dbPlugins = await PluginModel.find({ enabled: true }).sort({ downloads: -1 }).lean()
  const fromDb: PluginMarketItem[] = dbPlugins.map((p) => {
    const id = String((p as { _id: unknown })._id)
    return {
      id,
      name: p.name,
      description: p.description ?? '',
      category: mapDbCategory(p.category),
      version: p.version ?? '1.0.0',
      author: p.author ?? 'system',
      icon: p.icon ?? '',
      downloads: p.downloads ?? 0,
      installed: installed.has(id) || installed.has(p.name),
      tags: [],
    }
  })

  // Merge registry catalog when DB catalog is empty (dev / fresh tenant)
  const items =
    fromDb.length > 0
      ? fromDb
      : registryMarketItems(installed)

  // Include URL-installed plugins not already listed
  const listedIds = new Set(items.map((i) => i.id))
  for (const pluginId of installed) {
    if (listedIds.has(pluginId)) continue
    items.push({
      id: pluginId,
      name: pluginId,
      description: 'Installed from URL',
      category: 'expert',
      version: '1.0.0',
      author: 'external',
      icon: '',
      downloads: 0,
      installed: true,
      tags: ['external'],
    })
  }

  ctx.body = { success: true, data: items }
})

router.post('/market/install-from-url', validate(installFromUrlBodySchema), async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const { url } = ctx.request.body as { url: string }

  try {
    const raw = await fetchPluginJsonFromUrl(url)
    const expert = parseExternalPluginJson(raw)
    assertExternalExpertIdAllowed(expert.id, getPluginRegistry())

    // User/tenant scoped only — never write plugins/local or reload global registry
    await UserPluginModel.findOneAndUpdate(
      { userId: user.id, pluginId: expert.id },
      {
        $set: {
          tenantId: user.tenantId,
          userId: user.id,
          pluginId: expert.id,
          enabled: true,
          config: buildUserPluginInstallConfig(expert, url),
        },
      },
      { upsert: true, new: true },
    )

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        id: expert.id,
        name: expert.label,
        storage: 'user-plugin',
        installed: true,
      },
    }
  } catch (err) {
    if (err instanceof PluginMarketError) {
      ctx.status = err.status
      ctx.body = {
        success: false,
        error: { message: err.message, code: err.code },
      }
      return
    }
    throw err
  }
})

router.post('/market/:id/install', async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const pluginId = ctx.params.id

  const dbPlugin = isValidObjectId(pluginId)
    ? await PluginModel.findById(pluginId).lean()
    : null
  const registry = getPluginRegistry()
  const expert = registry.getExpert(pluginId) ?? undefined
  const skill = registry.listSkills().find((s) => s.id === pluginId)

  if (!dbPlugin && !expert && !skill) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Plugin not found', code: 'not_found' } }
    return
  }

  await UserPluginModel.findOneAndUpdate(
    { userId: user.id, pluginId },
    {
      $set: {
        tenantId: user.tenantId,
        userId: user.id,
        pluginId,
        enabled: true,
        config: dbPlugin
          ? { source: 'market', name: dbPlugin.name }
          : { source: 'registry', kind: expert ? 'expert' : 'skill' },
      },
    },
    { upsert: true, new: true },
  )

  if (dbPlugin) {
    await PluginModel.updateOne({ _id: pluginId }, { $inc: { downloads: 1 } })
  }

  ctx.body = { success: true, data: { id: pluginId, installed: true } }
})

router.post('/market/:id/uninstall', async (ctx) => {
  const user = ctx.state.user as JwtPayload
  const pluginId = ctx.params.id

  const result = await UserPluginModel.findOneAndUpdate(
    { userId: user.id, pluginId },
    { $set: { enabled: false } },
    { new: true },
  )

  if (!result) {
    ctx.status = 404
    ctx.body = {
      success: false,
      error: { message: 'Plugin installation not found', code: 'not_found' },
    }
    return
  }

  ctx.body = { success: true, data: { id: pluginId, installed: false } }
})

export default router

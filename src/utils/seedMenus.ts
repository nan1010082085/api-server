import { MenuModel } from '../models/Menu.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { PublishedSchemaModel } from '../models/PublishedSchema.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

interface MenuSeed {
  parentId: string | null
  name: string
  path: string
  icon: string
  type: 'menu' | 'button'
  permission: string
  sort: number
  microAppId: string | null
  target?: '_self' | '_blank'
  routeType?: 'schema' | 'micro-app' | 'link'
  schemaId?: string | null
  url?: string
  app?: string
  layout?: 'with-menu' | 'without-menu'
}

const MENUS: MenuSeed[] = [
  // ── Shell 内置页面 ──

  // 首页 — app=shell, with-menu
  { parentId: null,   name: '首页',       path: '/',                     icon: 'HomeFilled', type: 'menu', permission: '', sort: 0, microAppId: null, target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // ── 系统管理 (目录) — 必须先于子菜单创建 ──
  { parentId: null,   name: '系统管理',   path: '',            icon: 'Setting',    type: 'menu', permission: '', sort: 10, microAppId: null, app: 'admin', layout: 'with-menu' },

  // ── 系统管理 / 菜单管理 — with-menu ──
  { parentId: '__SYSTEM__', name: '菜单管理', path: '/app/editor/view', icon: 'Menu', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema' },

  // 微应用管理 — 放在系统管理下, app=shell, with-menu
  { parentId: '__SYSTEM__', name: '微应用管理', path: '/admin/micro-apps',      icon: 'Monitor',    type: 'menu', permission: '', sort: 2, microAppId: null, target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // ── 表单设计器 — without-menu（独立全屏，新页签） ──
  { parentId: null,   name: '表单设计器', path: '/standalone/editor',     icon: 'edit',       type: 'menu', permission: '', sort: 20, microAppId: 'editor', target: '_blank', app: 'shell', layout: 'without-menu' },

  // ── 流程设计器 — without-menu（独立全屏，新页签） ──
  { parentId: null,   name: '流程设计器', path: '/standalone/flow/designer', icon: 'Connection', type: 'menu', permission: '', sort: 30, microAppId: 'flow',  target: '_blank', app: 'shell', layout: 'without-menu' },

  // ── AI 应用 — without-menu（独立全屏，新页签） ──
  { parentId: null,   name: 'AI 应用',    path: '/standalone/ai',          icon: 'ChatDotRound', type: 'menu', permission: '', sort: 40, microAppId: 'ai', target: '_blank', app: 'shell', layout: 'without-menu' },
]

async function resolveParentId(parentId: string | null): Promise<string | null> {
  if (parentId !== '__SYSTEM__') return parentId
  const systemDir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: '系统管理', parentId: null })
  return systemDir ? String(systemDir._id) : null
}

/**
 * 种子数据：默认菜单树
 *
 * 使用 upsert + $setOnInsert 保证幂等：仅在记录不存在时创建，不覆盖用户修改
 * 按 (tenantId + name) 去重，让 MongoDB 自动生成 _id
 */
export async function seedMenus(): Promise<void> {
  let created = 0

  for (const menu of MENUS) {
    const menuData = { ...menu }
    menuData.parentId = await resolveParentId(menuData.parentId)

    const result = await MenuModel.updateOne(
      { tenantId: DEFAULT_TENANT_ID, name: menu.name },
      { $setOnInsert: { ...menuData, tenantId: DEFAULT_TENANT_ID } },
      { upsert: true },
    )

    if (result.upsertedCount > 0) created++
  }

  const skipped = MENUS.length - created
  console.log(`[seed] Menus: ${created} created, ${skipped} already existed`)
}

/**
 * 修复历史 seed 中 parentId 丢失的问题（__SYSTEM__ 在系统管理目录创建前被解析为 null）
 */
export async function repairMenuParentIds(): Promise<void> {
  const systemDir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: '系统管理', parentId: null })
  if (!systemDir) return

  const systemId = String(systemDir._id)
  const result = await MenuModel.updateMany(
    {
      tenantId: DEFAULT_TENANT_ID,
      name: { $in: ['菜单管理', '微应用管理'] },
      $or: [{ parentId: null }, { parentId: '' }],
    },
    { $set: { parentId: systemId } },
  )

  if (result.modifiedCount > 0) {
    console.log(`[seed] Repaired menu parentId for ${result.modifiedCount} item(s)`)
  }
}

/**
 * 修复历史 seed 中流程设计器菜单路径错误（/standalone/flow/design → /standalone/flow/designer）
 */
export async function repairFlowDesignerMenuPath(): Promise<void> {
  const result = await MenuModel.updateMany(
    {
      tenantId: DEFAULT_TENANT_ID,
      name: '流程设计器',
      path: '/standalone/flow/design',
    },
    { $set: { path: '/standalone/flow/designer' } },
  )
  if (result.modifiedCount > 0) {
    console.log(`[seed] Repaired Flow designer menu path for ${result.modifiedCount} item(s)`)
  }
}

/**
 * 迁移：为现有菜单补充 app/layout 字段
 * 仅在字段不存在时补充，不覆盖已有值
 */
export async function migrateMenuFields(): Promise<void> {
  await repairMenuParentIds()
  await repairFlowDesignerMenuPath()

  const systemDir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: '系统管理', parentId: null })
  if (!systemDir) return

  // 系统管理目录下的子菜单 → app=admin, layout=with-menu
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, parentId: systemDir._id, app: { $exists: false } },
    { $set: { app: 'admin', layout: 'with-menu' } },
  )
  // microAppId=admin 的菜单 → app=admin, layout=with-menu
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, microAppId: 'admin', app: { $exists: false } },
    { $set: { app: 'admin', layout: 'with-menu' } },
  )
  // microAppId=editor/flow/ai 的菜单 → app=shell, layout=without-menu
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, microAppId: { $in: ['editor', 'flow', 'ai'] }, app: { $exists: false } },
    { $set: { app: 'shell', layout: 'without-menu' } },
  )
  // 没有 microAppId 且没有 layout 的菜单 → 默认 with-menu
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, microAppId: null, layout: { $exists: false } },
    { $set: { layout: 'with-menu' } },
  )
}

import { MenuModel } from '../models/Menu.js'
import { FormSchemaModel } from '../models/FormSchema.js'
import { PublishedSchemaModel } from '../models/PublishedSchema.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import type { MenuSeed } from './seedMenusTypes.js'
import { EXTENDED_MENUS, EXTENDED_PARENT_PLACEHOLDERS } from './seedExtendedMenus.js'

export type { MenuSeed } from './seedMenusTypes.js'

const CORE_MENUS: MenuSeed[] = [
  // ── Shell 内置页面 ──
  { parentId: null, name: '首页', path: '/', icon: 'home-filled', type: 'menu', permission: '', sort: 0, microAppId: null, target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // ── Phase 1 P0：工作台 ──
  { parentId: null, name: '工作台', path: '/dashboard', icon: 'odometer', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'dashboard-workbench' },

  // ── Phase 1 P0：流程中心 ──
  { parentId: null, name: '流程中心', path: '', icon: 'connection', type: 'menu', permission: '', sort: 5, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__FLOW_CENTER__', name: '我的待办', path: '/app/flow/tasks', icon: 'bell', type: 'menu', permission: '', sort: 1, microAppId: 'flow', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // ── Phase 1 P0：人事管理 ──
  { parentId: null, name: '人事管理', path: '', icon: 'user-filled', type: 'menu', permission: '', sort: 15, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__HR__', name: '请假申请', path: '/app/editor/view', icon: 'calendar', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-leave-apply' },
  { parentId: '__HR__', name: '请假台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-leave-list' },

  // ── 系统管理 (目录) ──
  { parentId: null, name: '系统管理', path: '', icon: 'setting', type: 'menu', permission: '', sort: 10, microAppId: null, app: 'admin', layout: 'with-menu' },
  { parentId: '__SYSTEM__', name: '菜单管理', path: '/app/editor/view', icon: 'menu', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-menu-manage' },
  { parentId: '__SYSTEM__', name: '微应用管理', path: '/admin/micro-apps', icon: 'monitor', type: 'menu', permission: '', sort: 2, microAppId: null, target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__SYSTEM__', name: '用户管理', path: '/app/editor/view', icon: 'user', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-user-mgmt' },
  { parentId: '__SYSTEM__', name: '角色管理', path: '/app/editor/view', icon: 'medal', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-role-mgmt' },
  { parentId: '__SYSTEM__', name: '部门管理', path: '/app/editor/view', icon: 'house', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-dept-mgmt' },

  // ── Phase 1 P0：能力平台 ──
  { parentId: null, name: '能力平台', path: '', icon: 'cpu', type: 'menu', permission: '', sort: 50, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__PLATFORM__', name: 'Schema 管理', path: '/app/editor/instances', icon: 'grid', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__PLATFORM__', name: '表单数据', path: '/app/editor/submissions', icon: 'document', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__PLATFORM__', name: '流程定义', path: '/app/flow/list', icon: 'connection', type: 'menu', permission: '', sort: 3, microAppId: 'flow', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__PLATFORM__', name: '流程模板', path: '/app/flow/templates', icon: 'files', type: 'menu', permission: '', sort: 4, microAppId: 'flow', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__PLATFORM__', name: 'Agent 编排', path: '/app/ai/workflows', icon: 'cpu', type: 'menu', permission: '', sort: 5, microAppId: 'ai', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },
  { parentId: '__PLATFORM__', name: '知识库', path: '/app/ai/rag', icon: 'reading', type: 'menu', permission: '', sort: 6, microAppId: 'ai', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // ── 设计器全屏入口 ──
  { parentId: null, name: '表单设计器', path: '/standalone/editor', icon: 'edit', type: 'menu', permission: '', sort: 20, microAppId: 'editor', target: '_blank', app: 'shell', layout: 'without-menu', routeType: 'micro-app' },
  { parentId: null, name: '流程设计器', path: '/standalone/flow/designer', icon: 'connection', type: 'menu', permission: '', sort: 30, microAppId: 'flow', target: '_blank', app: 'shell', layout: 'without-menu', routeType: 'micro-app' },
  { parentId: null, name: 'AI 应用', path: '/standalone/ai', icon: 'chat-dot-round', type: 'menu', permission: '', sort: 40, microAppId: 'ai', target: '_blank', app: 'shell', layout: 'without-menu', routeType: 'micro-app' },
]

const MENUS: MenuSeed[] = [...CORE_MENUS, ...EXTENDED_MENUS]

const PARENT_PLACEHOLDERS: Record<string, string> = {
  __SYSTEM__: '系统管理',
  __FLOW_CENTER__: '流程中心',
  __HR__: '人事管理',
  __PLATFORM__: '能力平台',
  ...EXTENDED_PARENT_PLACEHOLDERS,
}

async function resolveParentId(parentId: string | null): Promise<string | null> {
  if (parentId === null) return null
  const dirName = PARENT_PLACEHOLDERS[parentId]
  if (!dirName) return parentId

  const dir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: dirName, parentId: null })
  return dir ? String(dir._id) : null
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
    delete menuData.schemaCode

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
 * 将 schemaCode 解析为 publishId 并写入菜单 schemaId（幂等）
 */
export async function bindMenuSchemaIds(): Promise<void> {
  const codeToMenuNames = new Map<string, string[]>()
  for (const menu of MENUS) {
    if (!menu.schemaCode) continue
    const names = codeToMenuNames.get(menu.schemaCode) ?? []
    names.push(menu.name)
    codeToMenuNames.set(menu.schemaCode, names)
  }

  let bound = 0
  for (const [code, menuNames] of codeToMenuNames) {
    const schema = await FormSchemaModel.findOne({ tenantId: DEFAULT_TENANT_ID, code })
    if (!schema) continue

    const published = await PublishedSchemaModel.findOne({ sourceId: schema.editId })
    if (!published) continue

    const publishId = published.publishId
    const result = await MenuModel.updateMany(
      {
        tenantId: DEFAULT_TENANT_ID,
        name: { $in: menuNames },
      },
      { $set: { schemaId: publishId, routeType: 'schema' } },
    )
    bound += result.modifiedCount
  }

  if (bound > 0) {
    console.log(`[seed] Bound menu schemaId for ${bound} item(s)`)
  }
}

/**
 * 修复历史 seed 中 parentId 丢失的问题
 */
export async function repairMenuParentIds(): Promise<void> {
  for (const [, dirName] of Object.entries(PARENT_PLACEHOLDERS)) {
    const dir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: dirName, parentId: null })
    if (!dir) continue

    const childNames = MENUS.filter((m) => PARENT_PLACEHOLDERS[m.parentId ?? ''] === dirName).map((m) => m.name)
    if (childNames.length === 0) continue

    const result = await MenuModel.updateMany(
      {
        tenantId: DEFAULT_TENANT_ID,
        name: { $in: childNames },
        $or: [{ parentId: null }, { parentId: '' }],
      },
      { $set: { parentId: String(dir._id) } },
    )

    if (result.modifiedCount > 0) {
      console.log(`[seed] Repaired parentId for ${result.modifiedCount} "${dirName}" child menu(s)`)
    }
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
 * 迁移：为现有菜单补充 app/layout/routeType 字段
 */
export async function migrateMenuFields(): Promise<void> {
  await repairMenuParentIds()
  await repairFlowDesignerMenuPath()

  const systemDir = await MenuModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: '系统管理', parentId: null })
  if (systemDir) {
    await MenuModel.updateMany(
      { tenantId: DEFAULT_TENANT_ID, parentId: systemDir._id, app: { $exists: false } },
      { $set: { app: 'admin', layout: 'with-menu' } },
    )
  }

  const adminChildNames = ['用户管理', '角色管理', '部门管理']
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, name: { $in: adminChildNames }, app: { $exists: false } },
    { $set: { app: 'admin', layout: 'with-menu', routeType: 'schema' } },
  )

  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, microAppId: 'admin', app: { $exists: false } },
    { $set: { app: 'admin', layout: 'with-menu' } },
  )

  const standaloneNames = ['表单设计器', '流程设计器', 'AI 应用']
  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, name: { $in: standaloneNames }, layout: { $exists: false } },
    { $set: { app: 'shell', layout: 'without-menu', routeType: 'micro-app' } },
  )

  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, name: '我的待办', routeType: { $exists: false } },
    { $set: { routeType: 'micro-app', microAppId: 'flow', layout: 'with-menu', app: 'shell' } },
  )

  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, name: '工作台', routeType: { $exists: false } },
    { $set: { routeType: 'schema', path: '/dashboard', layout: 'with-menu', app: 'shell' } },
  )

  await MenuModel.updateMany(
    { tenantId: DEFAULT_TENANT_ID, microAppId: null, layout: { $exists: false } },
    { $set: { layout: 'with-menu' } },
  )

  await bindMenuSchemaIds()
}

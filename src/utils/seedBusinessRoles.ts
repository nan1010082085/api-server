import { RoleModel } from '../models/Role.js'
import { UserModel } from '../models/User.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

export const BUSINESS_ROLE_NAMES = {
  departmentManager: '部门经理',
  hr: 'HR',
} as const

/** Placeholder codes in flow template → Role.name */
export const FLOW_ROLE_CODE_MAP: Record<string, string> = {
  department_manager: BUSINESS_ROLE_NAMES.departmentManager,
  hr: BUSINESS_ROLE_NAMES.hr,
}

const APPROVER_PERMISSIONS = [
  'schema:view',
  'flow:view',
  'flow:approve',
  'flow:start',
]

/**
 * Seed Phase 1 business approver roles (idempotent).
 */
export async function seedBusinessRoles(): Promise<void> {
  for (const name of Object.values(BUSINESS_ROLE_NAMES)) {
    const exists = await RoleModel.findOne({ tenantId: DEFAULT_TENANT_ID, name })
    if (exists) continue

    await RoleModel.create({
      name,
      description: `Phase 1 业务审批角色：${name}`,
      permissions: APPROVER_PERMISSIONS,
      data_scope: 'all',
      tenantId: DEFAULT_TENANT_ID,
    })
    console.log(`[seed] Business role created: ${name}`)
  }
}

/**
 * Attach business approver roles to admin so Phase 1 E2E can use admin/admin123456.
 */
export async function assignBusinessRolesToAdmin(): Promise<void> {
  const admin = await UserModel.findOne({ tenantId: DEFAULT_TENANT_ID, username: 'admin' })
  if (!admin) return

  const businessRoles = await RoleModel.find({
    tenantId: DEFAULT_TENANT_ID,
    name: { $in: Object.values(BUSINESS_ROLE_NAMES) },
  }).select('_id')

  const roleIds = businessRoles.map((r) => String(r._id))
  const merged = Array.from(new Set([...admin.roles, ...roleIds]))
  if (merged.length === admin.roles.length) return

  admin.roles = merged
  await admin.save()
  console.log('[seed] Admin user granted business approver roles')
}

/**
 * Resolve flow template role placeholders to MongoDB role IDs in graph nodes.
 */
export async function resolveLeaveFlowGraphRoles(
  graph: { nodes: Array<Record<string, unknown>> },
): Promise<boolean> {
  const roleIdByCode = new Map<string, string>()
  for (const [code, roleName] of Object.entries(FLOW_ROLE_CODE_MAP)) {
    const role = await RoleModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: roleName })
    if (role) roleIdByCode.set(code, String(role._id))
  }

  let changed = false
  for (const node of graph.nodes) {
    const data = node.data as Record<string, unknown> | undefined
    if (!data || data.bpmnType !== 'userTask' || data.assigneeType !== 'role') continue

    const codes = Array.isArray(data.candidateRoles)
      ? (data.candidateRoles as string[])
      : data.assignee
        ? [data.assignee as string]
        : []

    const resolved = codes
      .map((code) => roleIdByCode.get(code))
      .filter((id): id is string => Boolean(id))

    const finalRoles = resolved.length > 0
      ? resolved
      : codes.filter((c) => /^[a-f0-9]{24}$/i.test(c))

    if (finalRoles.length === 0) continue

    const prev = JSON.stringify(data.candidateRoles ?? data.assignee)
    data.candidateRoles = finalRoles
    delete data.assignee
    if (JSON.stringify(data.candidateRoles) !== prev) changed = true
  }

  return changed
}

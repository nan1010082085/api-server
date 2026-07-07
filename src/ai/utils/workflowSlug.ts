import { AgentWorkflowModel } from '../models/agentWorkflow.js'
import { toObjectId } from '../../utils/objectId.js'

const SLUG_MAX = 64

/** 将 workflow 名称转为 URL 友好的 slug */
export function slugifyWorkflowName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX)
  return base || 'workflow'
}

/** 校验 slug 格式（小写字母、数字、连字符） */
export function isValidWorkflowSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)
}

/** 同租户内保证 slug 唯一，冲突时追加 -2、-3 … */
export async function ensureUniqueWorkflowSlug(
  tenantId: string,
  base: string,
  excludeWorkflowId?: string,
): Promise<string> {
  let slug = base.slice(0, SLUG_MAX)
  let suffix = 1

  while (true) {
    const filter: Record<string, unknown> = { tenantId, slug }
    if (excludeWorkflowId) {
      filter._id = { $ne: toObjectId(excludeWorkflowId) }
    }
    const exists = await AgentWorkflowModel.findOne(filter).lean()
    if (!exists) return slug

    suffix += 1
    const tail = `-${suffix}`
    slug = `${base.slice(0, SLUG_MAX - tail.length)}${tail}`
  }
}

import mongoose from 'mongoose'

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

/** 严格校验 24 位十六进制 ObjectId（与 migrate-to-objectid 脚本一致） */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_RE.test(id)
}

export function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!isValidObjectId(id)) {
    throw new Error(`Invalid ObjectId: ${id}`)
  }
  return new mongoose.Types.ObjectId(id)
}

/** API 响应：文档主键 */
export function docId(doc: Record<string, unknown>): string {
  if (doc.id != null) return String(doc.id)
  if (doc._id != null) return String(doc._id)
  throw new Error('Document missing id')
}

/** API 响应：ObjectId 外键，未设置时返回 null */
export function refId(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

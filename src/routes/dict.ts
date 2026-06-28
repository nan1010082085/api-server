import Router from '@koa/router'
import mongoose from 'mongoose'
import { DictTypeModel } from '../models/DictType.js'
import { DictDataModel } from '../models/DictData.js'
import { authMiddleware } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permission.js'
import { validate } from '../middleware/validate.js'
import {
  createDictTypeSchema,
  updateDictTypeSchema,
  createDictDataSchema,
  updateDictDataSchema,
} from '../schemas/dictSchemas.js'

const requireAuth = authMiddleware({ required: true })
const router = new Router({ prefix: '/api/dict' })

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================
// 字典类型 CRUD
// ============================================================

// GET /api/dict/types — 字典类型列表（分页+搜索）
router.get('/types', requireAuth, requirePermission('dict:view'), async (ctx) => {
  const q = ctx.query.q as string
  const status = ctx.query.status as string
  const page = Math.max(1, parseInt(ctx.query.page as string) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.pageSize as string) || 20))

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: escapeRegex(q), $options: 'i' } },
      { code: { $regex: escapeRegex(q), $options: 'i' } },
    ]
  }
  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status
  }

  const [items, total] = await Promise.all([
    DictTypeModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    DictTypeModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: items.map((t) => t.toJSON()),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// GET /api/dict/types/:id — 获取单个字典类型
router.get('/types/:id', requireAuth, requirePermission('dict:view'), async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const dictType = await DictTypeModel.findById(id)
  if (!dictType) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典类型不存在' } }
    return
  }

  ctx.body = { success: true, data: dictType.toJSON() }
})

// POST /api/dict/types — 创建字典类型
router.post('/types', requireAuth, requirePermission('dict:create'), validate(createDictTypeSchema), async (ctx) => {
  const body = ctx.request.body as { name: string; code: string; status?: string; remark?: string }

  const existing = await DictTypeModel.findOne({ code: body.code })
  if (existing) {
    ctx.status = 409
    ctx.body = { success: false, error: { message: '字典类型编码已存在' } }
    return
  }

  const dictType = await DictTypeModel.create({
    name: body.name,
    code: body.code,
    status: body.status ?? 'active',
    remark: body.remark ?? '',
  })

  ctx.status = 201
  ctx.body = { success: true, data: dictType.toJSON() }
})

// PUT /api/dict/types/:id — 更新字典类型
router.put('/types/:id', requireAuth, requirePermission('dict:edit'), validate(updateDictTypeSchema), async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as { name?: string; code?: string; status?: string; remark?: string }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  // Check code uniqueness if changing
  if (body.code) {
    const existing = await DictTypeModel.findOne({ code: body.code, _id: { $ne: id } })
    if (existing) {
      ctx.status = 409
      ctx.body = { success: false, error: { message: '字典类型编码已存在' } }
      return
    }
  }

  const dictType = await DictTypeModel.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true, runValidators: true },
  )

  if (!dictType) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典类型不存在' } }
    return
  }

  ctx.body = { success: true, data: dictType.toJSON() }
})

// DELETE /api/dict/types/:id — 删除字典类型（级联删除关联数据）
router.delete('/types/:id', requireAuth, requirePermission('dict:delete'), async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const dictType = await DictTypeModel.findById(id)
  if (!dictType) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典类型不存在' } }
    return
  }

  // Cascade delete all dict data under this type
  await DictDataModel.deleteMany({ dictTypeId: id })
  await DictTypeModel.findByIdAndDelete(id)

  ctx.body = { success: true, data: null }
})

// ============================================================
// 字典数据 CRUD
// ============================================================

// GET /api/dict/data — 字典数据列表（按类型筛选+分页+搜索）
router.get('/data', requireAuth, requirePermission('dict:view'), async (ctx) => {
  const dictTypeId = ctx.query.dictTypeId as string
  const q = ctx.query.q as string
  const status = ctx.query.status as string
  const page = Math.max(1, parseInt(ctx.query.page as string) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(ctx.query.pageSize as string) || 20))

  const filter: Record<string, unknown> = {}
  if (dictTypeId) {
    if (!mongoose.Types.ObjectId.isValid(dictTypeId)) {
      ctx.status = 400
      ctx.body = { success: false, error: { message: 'Invalid dictTypeId UUID.' } }
      return
    }
    filter.dictTypeId = dictTypeId
  }
  if (q) {
    filter.$or = [
      { label: { $regex: escapeRegex(q), $options: 'i' } },
      { value: { $regex: escapeRegex(q), $options: 'i' } },
    ]
  }
  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status
  }

  const [items, total] = await Promise.all([
    DictDataModel.find(filter)
      .sort({ sort: 1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    DictDataModel.countDocuments(filter),
  ])

  ctx.body = {
    success: true,
    data: {
      items: items.map((d) => d.toJSON()),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})

// GET /api/dict/data/by-type/:code — 按字典类型编码获取数据项（兼容旧接口，返回启用项）
// 支持可选分页：传入 page/pageSize 时返回分页格式，否则返回向后兼容的数组格式
router.get('/data/by-type/:code', async (ctx) => {
  const { code } = ctx.params

  const dictType = await DictTypeModel.findOne({ code, status: 'active' })
  if (!dictType) {
    if (ctx.query.page || ctx.query.pageSize) {
      ctx.body = { success: true, data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } }
    } else {
      ctx.body = { success: true, data: [] }
    }
    return
  }

  const filter = { dictTypeId: dictType._id, status: 'active' }

  // 如果传入分页参数，返回分页格式
  if (ctx.query.page || ctx.query.pageSize) {
    const page = Math.max(1, parseInt(ctx.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(ctx.query.pageSize as string) || 20))
    const skip = (page - 1) * pageSize

    const [docs, total] = await Promise.all([
      DictDataModel.find(filter).sort({ sort: 1, createdAt: -1 }).skip(skip).limit(pageSize),
      DictDataModel.countDocuments(filter),
    ])

    ctx.body = {
      success: true,
      data: {
        items: docs.map((d) => ({ label: d.label, value: d.value })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    }
    return
  }

  // 无分页参数：向后兼容返回数组格式
  const items = await DictDataModel.find(filter).sort({ sort: 1, createdAt: -1 })

  ctx.body = {
    success: true,
    data: items.map((d) => ({ label: d.label, value: d.value })),
  }
})

// GET /api/dict/data/:id — 获取单个字典数据
router.get('/data/:id', requireAuth, requirePermission('dict:view'), async (ctx) => {
  const { id } = ctx.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const dictData = await DictDataModel.findById(id)
  if (!dictData) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典数据不存在' } }
    return
  }

  ctx.body = { success: true, data: dictData.toJSON() }
})

// POST /api/dict/data — 创建字典数据
router.post('/data', requireAuth, requirePermission('dict:create'), validate(createDictDataSchema), async (ctx) => {
  const body = ctx.request.body as {
    dictTypeId: string
    label: string
    value: string
    sort?: number
    status?: string
    remark?: string
  }

  // Validate parent type exists
  const parentType = await DictTypeModel.findById(body.dictTypeId)
  if (!parentType) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: '关联的字典类型不存在' } }
    return
  }

  // Check value uniqueness within same type
  const existing = await DictDataModel.findOne({ dictTypeId: body.dictTypeId, value: body.value })
  if (existing) {
    ctx.status = 409
    ctx.body = { success: false, error: { message: '同一字典类型下该值已存在' } }
    return
  }

  const dictData = await DictDataModel.create({
    dictTypeId: body.dictTypeId,
    label: body.label,
    value: body.value,
    sort: body.sort ?? 0,
    status: body.status ?? 'active',
    remark: body.remark ?? '',
  })

  ctx.status = 201
  ctx.body = { success: true, data: dictData.toJSON() }
})

// PUT /api/dict/data/:id — 更新字典数据
router.put('/data/:id', requireAuth, requirePermission('dict:edit'), validate(updateDictDataSchema), async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as {
    label?: string
    value?: string
    sort?: number
    status?: string
    remark?: string
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const existing = await DictDataModel.findById(id)
  if (!existing) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典数据不存在' } }
    return
  }

  // Check value uniqueness within same type if changing
  if (body.value && body.value !== existing.value) {
    const dup = await DictDataModel.findOne({ dictTypeId: existing.dictTypeId, value: body.value, _id: { $ne: id } })
    if (dup) {
      ctx.status = 409
      ctx.body = { success: false, error: { message: '同一字典类型下该值已存在' } }
      return
    }
  }

  const updated = await DictDataModel.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true, runValidators: true },
  )

  ctx.body = { success: true, data: updated!.toJSON() }
})

// DELETE /api/dict/data/:id — 删除字典数据
router.delete('/data/:id', requireAuth, requirePermission('dict:delete'), async (ctx) => {
  const { id } = ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'Invalid UUID format.' } }
    return
  }

  const dictData = await DictDataModel.findById(id)
  if (!dictData) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: '字典数据不存在' } }
    return
  }

  await DictDataModel.findByIdAndDelete(id)
  ctx.body = { success: true, data: null }
})

export default router

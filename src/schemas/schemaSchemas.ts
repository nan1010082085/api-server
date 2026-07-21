import { z } from 'zod'

/** 创建/更新共用：Widget[] 或 { widgets, board } */
export const schemaJsonSchema = z.union([
  z.array(z.unknown()),
  z.object({
    widgets: z.array(z.unknown()),
    board: z.record(z.unknown()).optional(),
  }),
])

export const createSchemaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  type: z.enum(['form', 'search-list', 'search_list']).default('form'),
  json: schemaJsonSchema,
  editId: z.string().uuid('Invalid UUID format').optional(),
  thumbnail: z.string().optional(),
}).strict()

export const updateSchemaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  json: schemaJsonSchema.optional(),
  type: z.enum(['form', 'search_list']).optional(),
  status: z.enum(['draft']).optional(),
  thumbnail: z.string().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field (name, json, type, or status) is required.',
})

/** Import 仅接受 Widget 树数组（深度校验 + ID 重生成；不接受 board 对象） */
export const importSchemaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['form', 'search-list', 'search_list']).default('form'),
  json: z.array(z.unknown()),
  thumbnail: z.string().optional(),
}).strict()

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'
import { scheduleSchemaRagIndex } from '../ai/services/ragIndexScheduler.js'

export interface IVersionSnapshot {
  version: string
  json: Record<string, unknown>
  createdAt: Date
}

export interface IFormSchema {
  _id: string
  tenantId: string
  editId: string
  /** Stable business identifier for seed/menu binding, e.g. hr-leave-apply */
  code?: string | null
  version: string
  name: string
  type: 'form' | 'search_list'
  status: 'draft'
  json: Record<string, unknown>
  thumbnail?: string
  createdBy: string | null
  versions: IVersionSnapshot[]
  createdAt: Date
  updatedAt: Date
}

const versionSnapshotSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    json: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const formSchemaDef = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    editId: { type: String, required: true, unique: true, index: true },
    code: { type: String, default: null, sparse: true, index: true },
    version: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['form', 'search_list', 'layout', 'table', 'chart', 'business', 'report', 'other'], default: 'form' },
    status: { type: String, enum: ['draft'], default: 'draft' },
    json: { type: mongoose.Schema.Types.Mixed, required: true },
    thumbnail: { type: String, default: '' },
    createdBy: { type: String, default: null, index: true },
    versions: { type: [versionSnapshotSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc: unknown, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.__v
      },
    },
  },
)

formSchemaDef.plugin(tenantPlugin)

formSchemaDef.post('save', function (doc: IFormSchema) {
  scheduleSchemaRagIndex(String(doc._id))
})

formSchemaDef.post('findOneAndUpdate', function (doc: IFormSchema | null) {
  if (!doc) return
  scheduleSchemaRagIndex(String(doc._id))
})

export const FormSchemaModel =
  mongoose.models.FormSchema ?? mongoose.model<IFormSchema>('FormSchema', formSchemaDef)

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'
import { scheduleFlowRagIndex } from '../ai/services/ragIndexScheduler.js'

export interface IFlowDefinition {
  tenantId: string
  name: string
  description?: string
  category?: string
  status: 'draft' | 'published' | 'archived'
  currentVersionId?: string
  thumbnail?: string
  /** F-04 默认业务表单 Schema（FormSchema _id） */
  formSchemaId?: string | null
  /** F-04 默认业务表单 publishId */
  formPublishId?: string | null
  createdBy: string
  permissions: {
    editors: string[]
    launchers: string[]
    viewers: string[]
  }
  createdAt: Date
  updatedAt: Date
}

const flowDefinitionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    currentVersionId: { type: String, default: null },
    thumbnail: { type: String, default: '' },
    formSchemaId: { type: String, default: null },
    formPublishId: { type: String, default: null },
    createdBy: { type: String, required: true },
    permissions: {
      editors: { type: [String], default: [] },
      launchers: { type: [String], default: [] },
      viewers: { type: [String], default: [] },
    },
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

flowDefinitionSchema.index({ name: 1 })
flowDefinitionSchema.index({ status: 1 })
flowDefinitionSchema.index({ createdBy: 1 })

flowDefinitionSchema.plugin(tenantPlugin)

flowDefinitionSchema.post('save', function (doc: IFlowDefinition & { _id: unknown }) {
  scheduleFlowRagIndex(String(doc._id))
})

flowDefinitionSchema.post('findOneAndUpdate', function (doc: (IFlowDefinition & { _id: unknown }) | null) {
  if (!doc) return
  scheduleFlowRagIndex(String(doc._id))
})

export const FlowDefinitionModel =
  mongoose.models.FlowDefinition ??
  mongoose.model<IFlowDefinition>('FlowDefinition', flowDefinitionSchema)

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export type ModelCapability = 'chat' | 'image' | 'video' | 'audio'

export const MODEL_CAPABILITIES: ModelCapability[] = ['chat', 'image', 'video', 'audio']

export interface IModelParameters {
  temperature: number
  maxTokens: number
  topP: number
}

export interface IModel {
  name: string
  providerId: mongoose.Types.ObjectId
  model: string
  parameters: IModelParameters
  capabilities: ModelCapability[]
  isDefault: boolean
  isActive: boolean
  tenantId: string
  createdAt: Date
  updatedAt: Date
}

const modelParametersSchema = new mongoose.Schema<IModelParameters>(
  {
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    maxTokens: { type: Number, default: 4096, min: 1 },
    topP: { type: Number, default: 1, min: 0, max: 1 },
  },
  { _id: false },
)

const modelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: true,
      index: true,
    },
    model: { type: String, required: true, trim: true },
    parameters: { type: modelParametersSchema, default: () => ({}) },
    capabilities: {
      type: [String],
      enum: MODEL_CAPABILITIES,
      default: ['chat'],
    },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    tenantId: { type: String, default: '000000', index: true },
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

modelSchema.index({ tenantId: 1, providerId: 1 })
modelSchema.index({ tenantId: 1, isDefault: 1 })
modelSchema.index({ tenantId: 1, isActive: 1 })

modelSchema.plugin(tenantPlugin)

export const ModelModel =
  mongoose.models.Model ?? mongoose.model<IModel>('Model', modelSchema)

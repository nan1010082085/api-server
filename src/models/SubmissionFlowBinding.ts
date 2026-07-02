import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface ISubmissionFlowBinding {
  _id: string
  name: string
  event: 'submission.created'
  schemaId: string
  flowDefinitionId: string
  enabled: boolean
  fieldMapping: Record<string, string>
  tenantId: string
  createdAt: Date
  updatedAt: Date
}

const submissionFlowBindingDef = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    event: { type: String, enum: ['submission.created'], default: 'submission.created', index: true },
    schemaId: { type: String, required: true, index: true },
    flowDefinitionId: { type: String, required: true, index: true },
    enabled: { type: Boolean, default: true, index: true },
    fieldMapping: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
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

submissionFlowBindingDef.plugin(tenantPlugin)
submissionFlowBindingDef.index({ tenantId: 1, event: 1, schemaId: 1, enabled: 1 })

export const SubmissionFlowBindingModel =
  mongoose.models.SubmissionFlowBinding
  ?? mongoose.model<ISubmissionFlowBinding>('SubmissionFlowBinding', submissionFlowBindingDef)

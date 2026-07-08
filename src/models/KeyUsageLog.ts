import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface IKeyUsageLog {
  tenantId: string
  keyId: string
  keyName: string
  workflowId: string | null
  workflowName: string | null
  endpoint: string
  method: string
  statusCode: number
  duration: number
  ip: string
  userAgent: string
  createdAt: Date
}

const keyUsageLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    keyId: { type: String, required: true, index: true },
    keyName: { type: String, default: '' },
    workflowId: { type: String, default: null, index: true },
    workflowName: { type: String, default: null },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true },
    duration: { type: Number, required: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc: unknown, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        delete ret.__v
      },
    },
  },
)

keyUsageLogSchema.plugin(tenantPlugin)

// Tenant-scoped queries
keyUsageLogSchema.index({ tenantId: 1, createdAt: -1 })
keyUsageLogSchema.index({ tenantId: 1, keyId: 1, createdAt: -1 })
keyUsageLogSchema.index({ tenantId: 1, workflowId: 1, createdAt: -1 })

export const KeyUsageLogModel =
  mongoose.models.KeyUsageLog ?? mongoose.model<IKeyUsageLog>('KeyUsageLog', keyUsageLogSchema)

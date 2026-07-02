import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface IMetrologyDevice {
  tenantId: string
  name: string
  code: string
  category: string
  calibrationDueAt?: Date | null
  status: 'valid' | 'expiring' | 'expired'
  location?: string | null
  createdAt: Date
  updatedAt: Date
}

const metrologyDeviceSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, index: true },
    category: { type: String, default: 'general' },
    calibrationDueAt: { type: Date, default: null },
    status: { type: String, enum: ['valid', 'expiring', 'expired'], default: 'valid' },
    location: { type: String, default: null },
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

metrologyDeviceSchema.index({ calibrationDueAt: 1 })
metrologyDeviceSchema.plugin(tenantPlugin)

export const MetrologyDeviceModel =
  mongoose.models.MetrologyDevice ?? mongoose.model<IMetrologyDevice>('MetrologyDevice', metrologyDeviceSchema)

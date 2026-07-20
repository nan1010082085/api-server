import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface ITelemetryError {
  tenantId: string
  userId: string
  message: string
  stack: string | null
  context: Record<string, unknown>
  clientTimestamp: number | null
  createdAt: Date
}

const telemetryErrorSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    stack: { type: String, default: null },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    clientTimestamp: { type: Number, default: null },
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

telemetryErrorSchema.index({ tenantId: 1, createdAt: -1 })

telemetryErrorSchema.plugin(tenantPlugin)

export const TelemetryErrorModel =
  mongoose.models.TelemetryError ??
  mongoose.model<ITelemetryError>('TelemetryError', telemetryErrorSchema)

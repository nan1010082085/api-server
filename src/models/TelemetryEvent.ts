import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface ITelemetryEvent {
  tenantId: string
  userId: string
  name: string
  properties: Record<string, unknown>
  clientTimestamp: number | null
  createdAt: Date
}

const telemetryEventSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    properties: { type: mongoose.Schema.Types.Mixed, default: {} },
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

telemetryEventSchema.index({ tenantId: 1, name: 1, createdAt: -1 })
telemetryEventSchema.index({ tenantId: 1, createdAt: -1 })

telemetryEventSchema.plugin(tenantPlugin)

export const TelemetryEventModel =
  mongoose.models.TelemetryEvent ??
  mongoose.model<ITelemetryEvent>('TelemetryEvent', telemetryEventSchema)

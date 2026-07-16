/**
 * Plugin-Level Metrics Model.
 *
 * Records per-plugin performance across executions:
 * - Which plugin type (expert, tool, mcp, skill) is used most
 * - Which plugin fails most often
 * - Plugin execution count, average duration, error rate
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../../middleware/tenantPlugin.js'

// ────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────

export type PluginType = 'expert' | 'tool' | 'mcp' | 'skill'

export interface IPluginMetric {
  tenantId: string
  pluginId: string
  pluginName: string
  pluginType: PluginType
  duration: number
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const pluginMetricSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    pluginId: { type: String, required: true, index: true },
    pluginName: { type: String, default: '' },
    pluginType: {
      type: String,
      required: true,
      index: true,
      enum: ['expert', 'tool', 'mcp', 'skill'],
    },
    duration: { type: Number, required: true, min: 0 },
    success: { type: Boolean, required: true, index: true },
    error: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
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

// Compound indexes for common aggregate queries
pluginMetricSchema.index({ pluginId: 1, createdAt: -1 })
pluginMetricSchema.index({ pluginType: 1, createdAt: -1 })
pluginMetricSchema.index({ pluginId: 1, success: 1 })
pluginMetricSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }) // TTL: 90 days

pluginMetricSchema.plugin(tenantPlugin)

// ────────────────────────────────────────────
// Model
// ────────────────────────────────────────────

export const PluginMetricModel =
  mongoose.models.PluginMetric ??
  mongoose.model<IPluginMetric>('PluginMetric', pluginMetricSchema)

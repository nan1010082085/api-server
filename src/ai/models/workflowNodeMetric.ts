/**
 * Workflow Node-Level Metrics Model.
 *
 * Records per-node performance across workflow executions:
 * - Which node type/ID is slowest
 * - Which node fails most often
 * - Node execution count and average duration
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../../middleware/tenantPlugin.js'

// ────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────

export interface IWorkflowNodeMetric {
  tenantId: string
  workflowId: string
  workflowName: string
  nodeId: string
  nodeType: string
  nodeName: string
  executionId: string
  duration: number
  success: boolean
  error?: string
  createdAt: Date
}

// ────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────

const workflowNodeMetricSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    workflowId: { type: String, required: true, index: true },
    workflowName: { type: String, default: '' },
    nodeId: { type: String, required: true, index: true },
    nodeType: { type: String, required: true, index: true },
    nodeName: { type: String, default: '' },
    executionId: { type: String, required: true, index: true },
    duration: { type: Number, required: true, min: 0 },
    success: { type: Boolean, required: true, index: true },
    error: { type: String },
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
workflowNodeMetricSchema.index({ workflowId: 1, nodeId: 1, createdAt: -1 })
workflowNodeMetricSchema.index({ workflowId: 1, nodeType: 1, createdAt: -1 })
workflowNodeMetricSchema.index({ nodeId: 1, success: 1 })
workflowNodeMetricSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }) // TTL: 90 days

workflowNodeMetricSchema.plugin(tenantPlugin)

// ────────────────────────────────────────────
// Model
// ────────────────────────────────────────────

export const WorkflowNodeMetricModel =
  mongoose.models.WorkflowNodeMetric ??
  mongoose.model<IWorkflowNodeMetric>('WorkflowNodeMetric', workflowNodeMetricSchema)

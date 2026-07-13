/**
 * Action Proposal Model — 持久化存储拟办数据
 * 替代 advancedFeatureRoutes.ts 中的内存 Map
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../../middleware/tenantPlugin.js'

const actionItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assignee: { type: String },
    deadline: { type: String },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    type: { type: String, enum: ['todo', 'approval', 'review', 'decision'], default: 'todo' },
  },
  { _id: false },
)

const actionProposalSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    userId: { type: String, required: true, index: true },
    documentTitle: { type: String },
    summary: { type: String, default: '' },
    actionItems: { type: [actionItemSchema], default: [] },
    approvalChain: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    selectedIds: { type: [String], default: [] },
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

actionProposalSchema.index({ userId: 1, createdAt: -1 })
actionProposalSchema.plugin(tenantPlugin)

export const ActionProposalModel =
  mongoose.models.ActionProposal ??
  mongoose.model('ActionProposal', actionProposalSchema)

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface IAuditIssue {
  tenantId: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'closed'
  severity: 'low' | 'medium' | 'high'
  projectId?: string | null
  createdBy?: string | null
  createdAt: Date
  updatedAt: Date
}

const auditIssueSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'in_progress', 'closed'], default: 'open' },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    projectId: { type: String, default: null },
    createdBy: { type: String, default: null },
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

auditIssueSchema.plugin(tenantPlugin)

export const AuditIssueModel =
  mongoose.models.AuditIssue ?? mongoose.model<IAuditIssue>('AuditIssue', auditIssueSchema)

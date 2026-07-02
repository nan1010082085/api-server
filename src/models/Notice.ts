import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface INotice {
  tenantId: string
  title: string
  content: string
  status: 'draft' | 'published' | 'archived'
  publishAt?: Date | null
  createdBy?: string | null
  createdAt: Date
  updatedAt: Date
}

const noticeSchema = new mongoose.Schema(
  {
    tenantId: { type: String, default: '000000', index: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    publishAt: { type: Date, default: null },
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

noticeSchema.index({ status: 1, publishAt: -1 })
noticeSchema.plugin(tenantPlugin)

export const NoticeModel =
  mongoose.models.Notice ?? mongoose.model<INotice>('Notice', noticeSchema)

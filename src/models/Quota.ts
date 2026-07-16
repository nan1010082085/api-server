/**
 * Quota Model
 *
 * Stores per-key and per-tenant usage quotas.
 * Used for rate limiting and usage tracking.
 */

import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'

export interface IQuota {
  /** The key this quota applies to (API key, tenant ID, or user ID) */
  key: string
  /** Type of quota: 'apikey' | 'tenant' | 'user' */
  keyType: 'apikey' | 'tenant' | 'user'
  /** Maximum requests per window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
  /** Current usage in the current window */
  currentUsage: number
  /** When the current window resets */
  windowResetAt: Date
  /** Tenant ID for multi-tenancy */
  tenantId: string
  /** Whether this quota is active */
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const quotaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    keyType: {
      type: String,
      required: true,
      enum: ['apikey', 'tenant', 'user'],
    },
    maxRequests: { type: Number, required: true, min: 1 },
    windowSeconds: { type: Number, required: true, min: 1 },
    currentUsage: { type: Number, default: 0 },
    windowResetAt: { type: Date, default: () => new Date() },
    tenantId: { type: String, default: '000000', index: true },
    isActive: { type: Boolean, default: true },
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

quotaSchema.index({ key: 1, keyType: 1 }, { unique: true })
quotaSchema.index({ tenantId: 1, isActive: 1 })

quotaSchema.plugin(tenantPlugin)

export const QuotaModel =
  mongoose.models.Quota ?? mongoose.model<IQuota>('Quota', quotaSchema)

/**
 * Check if a request is allowed under the quota.
 * Returns { allowed, remaining, resetAt }.
 */
export async function checkQuota(
  key: string,
  keyType: 'apikey' | 'tenant' | 'user',
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date()
  let quota = await QuotaModel.findOne({ key, keyType, isActive: true })

  // No quota configured = unlimited
  if (!quota) {
    return { allowed: true, remaining: Infinity, resetAt: now }
  }

  // Check if window has reset
  if (quota.windowResetAt <= now) {
    quota.currentUsage = 0
    quota.windowResetAt = new Date(now.getTime() + quota.windowSeconds * 1000)
    await quota.save()
  }

  const remaining = Math.max(0, quota.maxRequests - quota.currentUsage)
  return {
    allowed: quota.currentUsage < quota.maxRequests,
    remaining,
    resetAt: quota.windowResetAt,
  }
}

/**
 * Increment usage counter for a quota.
 */
export async function incrementQuota(
  key: string,
  keyType: 'apikey' | 'tenant' | 'user',
): Promise<void> {
  const now = new Date()
  const quota = await QuotaModel.findOne({ key, keyType, isActive: true })

  if (!quota) return

  // Reset window if needed
  if (quota.windowResetAt <= now) {
    quota.currentUsage = 1
    quota.windowResetAt = new Date(now.getTime() + quota.windowSeconds * 1000)
  } else {
    quota.currentUsage++
  }

  await quota.save()
}

/**
 * Create or update a quota.
 */
export async function setQuota(
  key: string,
  keyType: 'apikey' | 'tenant' | 'user',
  maxRequests: number,
  windowSeconds: number,
): Promise<IQuota> {
  const now = new Date()
  return QuotaModel.findOneAndUpdate(
    { key, keyType },
    {
      maxRequests,
      windowSeconds,
      currentUsage: 0,
      windowResetAt: new Date(now.getTime() + windowSeconds * 1000),
      isActive: true,
    },
    { upsert: true, new: true },
  )
}

/**
 * Remove a quota.
 */
export async function removeQuota(
  key: string,
  keyType: 'apikey' | 'tenant' | 'user',
): Promise<boolean> {
  const result = await QuotaModel.deleteOne({ key, keyType })
  return result.deletedCount > 0
}

import mongoose from 'mongoose'

const idempotencySchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    keyId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    executionId: { type: String, required: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

idempotencySchema.index({ tenantId: 1, keyId: 1, idempotencyKey: 1 }, { unique: true })
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const OpenWorkflowIdempotencyModel =
  mongoose.models.OpenWorkflowIdempotency ??
  mongoose.model('OpenWorkflowIdempotency', idempotencySchema)

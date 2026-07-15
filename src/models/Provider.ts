import mongoose from 'mongoose'
import { tenantPlugin } from '../middleware/tenantPlugin.js'
import { encrypt, decrypt } from '../services/credentialService.js'

export type ProviderType = 'deepseek' | 'openai' | 'ollama' | 'mimo' | 'azure' | 'custom'

export interface IProvider {
  name: string
  type: ProviderType
  baseUrl: string
  apiKey: string
  isActive: boolean
  tenantId: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Resolve apiKey stored in DB (encrypted blob or legacy plaintext).
 * Must be used for `.lean()` queries that skip mongoose decrypt hooks.
 */
export function resolveStoredProviderApiKey(raw: string | undefined | null): string {
  if (!raw) return ''
  try {
    const data = decrypt(raw)
    if (typeof data.apiKey === 'string') return data.apiKey
  } catch {
    // plaintext legacy / non-encrypted
  }
  return raw
}

/** Default chat model used for provider-level connection tests */
export function getProviderProbeModel(type: string): string {
  switch (type) {
    case 'deepseek':
      return 'deepseek-v4-flash'
    case 'mimo':
      return 'mimo-v2.5'
    case 'openai':
    case 'azure':
    case 'custom':
      return 'gpt-4o-mini'
    case 'ollama':
      return 'llama3'
    default:
      return 'deepseek-v4-flash'
  }
}

const providerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['deepseek', 'openai', 'ollama', 'mimo', 'azure', 'custom'],
    },
    baseUrl: { type: String, required: true, trim: true },
    apiKey: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    tenantId: { type: String, default: '000000', index: true },
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

providerSchema.index({ tenantId: 1, type: 1 })
providerSchema.index({ tenantId: 1, isActive: 1 })

// Encrypt apiKey before saving
providerSchema.pre('save', function (this: IProvider & mongoose.Document) {
  if (this.apiKey && this.isModified('apiKey')) {
    this.apiKey = encrypt({ apiKey: this.apiKey })
  }
})

// Decrypt apiKey after finding（unmarkModified 避免后续 save 把明文再加密一遍）
function decryptApiKey(doc: (IProvider & mongoose.Document) | null) {
  if (!doc?.apiKey) return
  const plain = resolveStoredProviderApiKey(doc.apiKey)
  if (plain === doc.apiKey) return
  doc.apiKey = plain
  if (typeof doc.unmarkModified === 'function') {
    doc.unmarkModified('apiKey')
  }
}

providerSchema.post('findOne', decryptApiKey)
providerSchema.post('findOneAndUpdate', decryptApiKey)
providerSchema.post('findOneAndDelete', decryptApiKey)

providerSchema.post('find', function (docs: (IProvider & mongoose.Document)[]) {
  if (!Array.isArray(docs)) return
  for (const doc of docs) {
    decryptApiKey(doc)
  }
})

providerSchema.plugin(tenantPlugin)

export const ProviderModel =
  mongoose.models.Provider ?? mongoose.model<IProvider>('Provider', providerSchema)

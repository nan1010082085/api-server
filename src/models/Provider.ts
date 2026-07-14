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

// Decrypt apiKey after finding
function decryptApiKey(doc: IProvider | null) {
  if (doc?.apiKey) {
    try {
      doc.apiKey = decrypt(doc.apiKey).apiKey ?? ''
    } catch {
      // If decryption fails (e.g., plaintext legacy data), leave as-is
    }
  }
}

providerSchema.post('findOne', decryptApiKey)
providerSchema.post('findOneAndUpdate', decryptApiKey)
providerSchema.post('findOneAndDelete', decryptApiKey)

providerSchema.post('find', function (docs: IProvider[]) {
  if (!Array.isArray(docs)) return
  for (const doc of docs) {
    decryptApiKey(doc)
  }
})

providerSchema.plugin(tenantPlugin)

export const ProviderModel =
  mongoose.models.Provider ?? mongoose.model<IProvider>('Provider', providerSchema)

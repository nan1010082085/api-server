import { z } from 'zod'

// ── Provider Schemas ──

export const createProviderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['deepseek', 'openai', 'ollama', 'mimo', 'azure', 'custom']),
  baseUrl: z.string().url('Invalid base URL').max(500),
  apiKey: z.string().max(500).optional().default(''),
  isActive: z.boolean().optional().default(true),
}).strict()

export const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['deepseek', 'openai', 'ollama', 'mimo', 'azure', 'custom']).optional(),
  baseUrl: z.string().url('Invalid base URL').max(500).optional(),
  apiKey: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required for update.',
})

export const testProviderSchema = z.object({
  message: z.string().min(1).max(1000).optional().default('Hello, respond with OK'),
}).strict()

// ── Model Schemas ──

const modelParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  topP: z.number().min(0).max(1).optional(),
}).strict()

const modelCapabilitySchema = z.enum(['chat', 'image', 'video', 'audio'])

export const createModelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  providerId: z.string().min(1, 'Provider ID is required'),
  model: z.string().min(1, 'Model identifier is required').max(100),
  parameters: modelParametersSchema.optional(),
  capabilities: z.array(modelCapabilitySchema).optional().default(['chat']),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
}).strict()

export const updateModelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  providerId: z.string().min(1).optional(),
  model: z.string().min(1).max(100).optional(),
  parameters: modelParametersSchema.optional(),
  capabilities: z.array(modelCapabilitySchema).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required for update.',
})

export const testModelSchema = z.object({
  message: z.string().min(1).max(1000).optional().default('Hello, respond with OK'),
}).strict()

// ── Embedding Config Schemas ──

export const updateEmbeddingConfigSchema = z.object({
  provider: z.enum(['siliconflow', 'openai', 'custom']).optional(),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.string().url('Invalid base URL').max(500).optional(),
  apiKey: z.string().max(500).optional(),
  dimensions: z.number().int().min(1).max(10000).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required for update.',
})

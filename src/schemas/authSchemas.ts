import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  password: z.string().min(1, 'Password is required'),
  tenantCode: z.string().optional(),
}).strict()

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).strict()

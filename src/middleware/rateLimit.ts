/**
 * Rate Limiting Middleware
 *
 * Provides per-key and per-tenant rate limiting using Redis.
 * Falls back to in-memory counters when Redis is unavailable.
 */

import type { Context, Next } from 'koa'
import { redis } from '../config/redis.js'
import { logger } from '../utils/logger.js'

interface RateLimitConfig {
  /** Maximum requests per window */
  max: number
  /** Window duration in seconds */
  windowSeconds: number
  /** Key prefix for Redis */
  keyPrefix?: string
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

// In-memory fallback for dev/no-Redis
const memoryCounters = new Map<string, { count: number; resetAt: number }>()

/**
 * Check rate limit for a given key.
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowKey = `${config.keyPrefix || 'rl'}:${key}`

  try {
    // Try Redis first
    if (redis.status === 'ready') {
      const multi = redis.multi()
      multi.incr(windowKey)
      multi.expire(windowKey, config.windowSeconds)
      const results = await multi.exec()
      const count = results?.[0]?.[1] as number ?? 1

      return {
        allowed: count <= config.max,
        remaining: Math.max(0, config.max - count),
        resetAt: now + config.windowSeconds,
      }
    }
  } catch {
    // Redis failed, fall through to memory
  }

  // In-memory fallback
  const entry = memoryCounters.get(windowKey)
  if (!entry || entry.resetAt <= now) {
    memoryCounters.set(windowKey, { count: 1, resetAt: now + config.windowSeconds })
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowSeconds }
  }

  entry.count++
  return {
    allowed: entry.count <= config.max,
    remaining: Math.max(0, config.max - entry.count),
    resetAt: entry.resetAt,
  }
}

/**
 * Rate limit middleware factory.
 *
 * @param config - Rate limit configuration
 * @param keyFn - Function to extract the rate limit key from context
 */
export function rateLimit(
  config: RateLimitConfig,
  keyFn: (ctx: Context) => string,
) {
  return async (ctx: Context, next: Next) => {
    const key = keyFn(ctx)
    const result = await checkRateLimit(key, config)

    // Set rate limit headers
    ctx.set('X-RateLimit-Limit', String(config.max))
    ctx.set('X-RateLimit-Remaining', String(result.remaining))
    ctx.set('X-RateLimit-Reset', String(result.resetAt))

    if (!result.allowed) {
      ctx.status = 429
      ctx.body = {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again after ${result.resetAt}`,
        retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
      }
      ctx.set('Retry-After', String(result.resetAt - Math.floor(Date.now() / 1000)))
      return
    }

    await next()
  }
}

/**
 * Extract rate limit key from API Key header.
 */
export function apiKeyKeyFn(ctx: Context): string {
  return ctx.get('X-API-Key') || ctx.get('X-Workflow-Key') || 'anonymous'
}

/**
 * Extract rate limit key from tenant ID.
 */
export function tenantKeyFn(ctx: Context): string {
  return ctx.get('X-Tenant-Id') || 'default'
}

/**
 * Extract rate limit key from authenticated user.
 */
export function userKeyFn(ctx: Context): string {
  const user = ctx.state.user
  return user?.id || user?.userId || 'anonymous'
}

/**
 * Default rate limit configurations.
 */
export const RATE_LIMITS = {
  /** API Key: 100 requests per minute */
  apiKey: { max: 100, windowSeconds: 60, keyPrefix: 'rl:apikey' },
  /** Workflow invoke: 50 requests per minute */
  workflowInvoke: { max: 50, windowSeconds: 60, keyPrefix: 'rl:workflow' },
  /** General API: 200 requests per minute */
  general: { max: 200, windowSeconds: 60, keyPrefix: 'rl:api' },
  /** Auth endpoints: 10 requests per minute */
  auth: { max: 10, windowSeconds: 60, keyPrefix: 'rl:auth' },
} as const

/**
 * Clear all in-memory rate limit counters.
 * Useful for testing.
 */
export function clearRateLimitCounters(): void {
  memoryCounters.clear()
}

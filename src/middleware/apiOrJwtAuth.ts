import type { Middleware } from 'koa'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/jwt.js'
import { ApiKeyModel } from '../models/ApiKey.js'
import { KeyUsageLogModel } from '../models/KeyUsageLog.js'
import type { JwtPayload } from './auth.js'
import type { ApiKeyAuthState } from './apiKeyAuth.js'

export interface JwtAuthState {
  tenantId: string
  userId: string
  source: 'jwt'
  username: string
  roles: string[]
  deptId: string | null
}

export type AuthState = JwtAuthState | ApiKeyAuthState

/**
 * JWT 或 API Key 双通道认证中间件
 *
 * 优先检查 Authorization header（JWT），
 * 其次检查 X-API-Key header（API Key），
 * 两者都无效则返回 401。
 *
 * 认证成功后注入 ctx.state.auth，包含 tenantId、userId 和 source。
 */
export function apiOrJwtAuthMiddleware(): Middleware {
  return async (ctx, next) => {
    // 本地开发跳过认证
    if (process.env.NODE_ENV !== 'production') {
      ctx.state.auth = {
        tenantId: '000000',
        userId: 'dev',
        source: 'jwt',
        username: 'dev',
        roles: [],
        deptId: null,
      } satisfies JwtAuthState
      await next()
      return
    }

    // 1. 尝试 JWT
    const authHeader = ctx.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
        if (payload.tokenType !== 'refresh') {
          ctx.state.auth = {
            tenantId: payload.tenantId,
            userId: payload.id,
            source: 'jwt',
            username: payload.username,
            roles: payload.roles,
            deptId: payload.deptId,
          } satisfies JwtAuthState
          await next()
          return
        }
      } catch {
        // JWT 无效，继续尝试 API Key
      }
    }

    // 2. 尝试 API Key
    const apiKey = ctx.get('X-API-Key')
    if (apiKey) {
      const record = await ApiKeyModel.findOne({ key: apiKey })

      if (!record) {
        ctx.status = 401
        ctx.body = {
          success: false,
          error: { message: 'Invalid API key.' },
        }
        return
      }

      if (record.status !== 'active') {
        ctx.status = 401
        ctx.body = {
          success: false,
          error: { message: 'API key is disabled.' },
        }
        return
      }

      if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
        ctx.status = 401
        ctx.body = {
          success: false,
          error: { message: 'API key has expired.' },
        }
        return
      }

      const startTime = Date.now()

      // 异步更新 lastUsedAt，不阻塞请求
      ApiKeyModel.updateOne({ _id: record._id }, { lastUsedAt: new Date() }).exec()

      ctx.state.auth = {
        tenantId: record.tenantId,
        userId: record.createdBy,
        source: 'apiKey',
        keyId: String(record._id),
        keyName: record.name,
        permissions: record.permissions,
      } satisfies ApiKeyAuthState

      await next()

      // 记录使用日志（异步，不阻塞响应）
      const duration = Date.now() - startTime
      const workflowId = ctx.get('X-Workflow-Id') || null
      const workflowName = ctx.get('X-Workflow-Name') || null

      KeyUsageLogModel.create({
        tenantId: record.tenantId,
        keyId: String(record._id),
        keyName: record.name,
        workflowId,
        workflowName,
        endpoint: ctx.url,
        method: ctx.method,
        statusCode: ctx.status,
        duration,
        ip: ctx.ip,
        userAgent: ctx.get('User-Agent') || '',
      }).catch((err: unknown) => {
        console.error('[keyUsage] Failed to write usage log:', err instanceof Error ? err.message : String(err))
      })

      return
    }

    // 3. 两者都无效
    ctx.status = 401
    ctx.body = {
      success: false,
      error: { message: 'Authentication required. Provide a valid Bearer token or X-API-Key header.' },
    }
  }
}

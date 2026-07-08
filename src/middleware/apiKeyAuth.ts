import type { Middleware } from 'koa'
import { ApiKeyModel } from '../models/ApiKey.js'
import { KeyUsageLogModel } from '../models/KeyUsageLog.js'

export interface ApiKeyAuthState {
  tenantId: string
  userId: string
  source: 'apiKey'
  keyId: string
  keyName: string
  permissions: string[]
}

/**
 * API Key 认证中间件
 *
 * 从 X-API-Key header 读取 key，查找 ApiKeyModel 中匹配的记录，
 * 验证状态和过期时间，更新 lastUsedAt，注入 tenantId/userId 到 ctx.state。
 *
 * 必须提供有效的 key，否则返回 401。
 */
export function apiKeyAuthMiddleware(): Middleware {
  return async (ctx, next) => {
    let apiKey = ctx.get('X-API-Key')
    if (!apiKey) {
      const authHeader = ctx.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim()
        if (token.startsWith('sk_')) {
          apiKey = token
        }
      }
    }

    if (!apiKey) {
      ctx.status = 401
      ctx.body = {
        success: false,
        error: { message: 'X-API-Key or Bearer sk_* token is required.', code: 'invalid_api_key' },
      }
      return
    }

    const record = await ApiKeyModel.findOne({ key: apiKey })

    if (!record) {
      ctx.status = 401
      ctx.body = {
        success: false,
        error: { message: 'Invalid API key.', code: 'invalid_api_key' },
      }
      return
    }

    if (record.status !== 'active') {
      ctx.status = 401
      ctx.body = {
        success: false,
        error: { message: 'API key is disabled.', code: 'invalid_api_key' },
      }
      return
    }

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      ctx.status = 401
      ctx.body = {
        success: false,
        error: { message: 'API key has expired.', code: 'invalid_api_key' },
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
  }
}

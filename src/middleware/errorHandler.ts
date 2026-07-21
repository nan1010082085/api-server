import type { Middleware } from 'koa'

interface AppError extends Error {
  status?: number
  expose?: boolean
  code?: string
}

function mapStatusToCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status >= 400 && status < 500) return 'BAD_REQUEST'
  return 'INTERNAL_ERROR'
}

export const errorHandler: Middleware = async (ctx, next) => {
  try {
    await next()
  } catch (err: unknown) {
    const appError = err as AppError
    const status = appError.status ?? 500
    const isExposed = appError.expose === true || status < 500
    const isDev = process.env.NODE_ENV === 'development'

    const message = isExposed
      ? appError.message || 'Bad Request'
      : isDev
        ? appError.message || 'Internal Server Error'
        : 'Internal Server Error'

    const code =
      typeof appError.code === 'string' && appError.code.length > 0
        ? appError.code
        : mapStatusToCode(status)

    ctx.status = status
    ctx.body = {
      success: false,
      error: {
        code,
        message,
      },
    }

    if (status >= 500) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        status,
        method: ctx.method,
        url: ctx.url,
        ip: ctx.ip,
        userAgent: ctx.get('User-Agent'),
        requestId: ctx.get('X-Request-Id'),
        message: appError.message,
        stack: appError.stack,
      }
      console.error(JSON.stringify(logEntry))
    }

    ctx.app.emit('error', err, ctx)
  }
}

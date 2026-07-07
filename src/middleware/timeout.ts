import type { Middleware } from 'koa'

const DEFAULT_TIMEOUT = 30_000 // 30 seconds

export function timeoutMiddleware(ms: number = DEFAULT_TIMEOUT): Middleware {
  return async (ctx, next) => {
    // Skip timeout for SSE and long-running RAG batch reindex
    const isSSE =
      ctx.path.includes('/chat') ||
      ctx.path.includes('/resume') ||
      ctx.path.includes('/open/workflow-executions/') && ctx.path.endsWith('/stream')
    const isRagBatchReindex = ctx.method === 'POST' && ctx.path === '/api/ai/rag/reindex'
    if (isSSE || isRagBatchReindex) {
      await next()
      return
    }

    const timer = setTimeout(() => {
      if (!ctx.headerSent) {
        ctx.status = 503
        ctx.body = {
          success: false,
          error: { message: 'Request timeout' },
        }
      }
    }, ms)

    try {
      await next()
    } finally {
      clearTimeout(timer)
    }
  }
}

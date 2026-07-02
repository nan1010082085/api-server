import 'dotenv/config'
import { createServer } from 'node:http'
import app from './app.js'
import { connectDatabase, mongoose } from './config/database.js'
import { initSocket } from './socket.js'
import { setSocketInstance } from './services/socketService.js'
import { initWebhookDispatcher } from './services/webhookDispatcher.js'
import { runBusinessSeeds } from './utils/runBusinessSeeds.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

async function start() {
  await connectDatabase()

  try {
    await runBusinessSeeds()
  } catch (err) {
    console.error('[seed] Business seed failed:', err instanceof Error ? err.message : String(err))
  }

  initWebhookDispatcher()

  const httpServer = createServer(app.callback())
  const io = initSocket(httpServer)
  setSocketInstance(io)

  const server = httpServer.listen(PORT, () => {
    console.log(`[server] Schema API running at http://localhost:${PORT}`)
    console.log(`[server] Health check: http://localhost:${PORT}/api/health`)

    server.keepAliveTimeout = 300_000
    server.headersTimeout = 310_000
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] 端口 ${PORT} 已被占用，请先停止旧进程：lsof -ti:${PORT} | xargs kill`)
      process.exit(1)
    }
    throw err
  })

  let shuttingDown = false
  async function shutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[server] Received ${signal}, shutting down gracefully...`)

    server.close(async () => {
      console.log('[server] HTTP server closed')
      try {
        await mongoose.disconnect()
        console.log('[server] MongoDB disconnected')
      } catch { /* DB might already be closed */ }
      process.exit(0)
    })

    setTimeout(() => {
      console.log('[server] Forced shutdown after timeout')
      process.exit(1)
    }, 30_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  return server
}

start()

/**
 * Agent Workflow WebSocket handler
 *
 * 客户端订阅 workflow:{executionId} 房间，接收 workflow:event 推送。
 */

import type { Socket, Server } from 'socket.io'
import { getAgentWorkflowExecution } from './services/agentWorkflowService.js'
import { logger } from '../utils/logger.js'

function resolveUserId(socket: Socket): string | null {
  const user = socket.data.user as { id?: string; userId?: string } | undefined
  return user?.id ?? user?.userId ?? null
}

export function registerWorkflowHandlers(socket: Socket, _io: Server): void {
  const socketId = socket.id

  socket.on('workflow:subscribe', async (data: { executionId?: string }) => {
    const executionId = data?.executionId?.trim()
    const userId = resolveUserId(socket)
    if (!executionId || !userId) {
      socket.emit('workflow:error', { message: 'executionId and auth required' })
      return
    }

    try {
      const execution = await getAgentWorkflowExecution(executionId, userId)
      if (!execution) {
        socket.emit('workflow:error', { executionId, message: 'Execution not found' })
        return
      }

      socket.join(`workflow:${executionId}`)
      logger.info({ msg: `[WS:workflow] subscribe ${socketId}`, executionId })
      socket.emit('workflow:event', { executionId, execution })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      socket.emit('workflow:error', { executionId, message })
    }
  })

  socket.on('workflow:unsubscribe', (data: { executionId?: string }) => {
    const executionId = data?.executionId?.trim()
    if (!executionId) return
    socket.leave(`workflow:${executionId}`)
    logger.info({ msg: `[WS:workflow] unsubscribe ${socketId}`, executionId })
  })
}

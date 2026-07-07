/**
 * 将 Agent Workflow 执行状态推送到 Socket.IO 房间 workflow:{executionId}
 */

import { AgentWorkflowExecutionModel } from './models/agentWorkflow.js'
import { toExecution } from './services/agentWorkflowService.js'
import { getIO } from '../socket.js'
import { leanDoc } from '../utils/leanDoc.js'

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function workflowRoom(executionId: string): string {
  return `workflow:${executionId}`
}

async function emitExecutionSnapshot(executionId: string): Promise<void> {
  const io = getIO()
  if (!io) return

  const doc = leanDoc<Record<string, unknown>>(
    await AgentWorkflowExecutionModel.findById(executionId).lean(),
  )
  if (!doc) return

  const execution = toExecution(doc)
  io.to(workflowRoom(executionId)).emit('workflow:event', { executionId, execution })
}

/**
 * 推送执行状态更新。流式 LLM 输出使用防抖，节点状态变更应 immediate。
 */
export function pushWorkflowExecutionUpdate(
  executionId: string,
  opts: { immediate?: boolean } = {},
): void {
  if (opts.immediate) {
    const pending = debounceTimers.get(executionId)
    if (pending) {
      clearTimeout(pending)
      debounceTimers.delete(executionId)
    }
    void emitExecutionSnapshot(executionId)
    return
  }

  if (debounceTimers.has(executionId)) return

  const timer = setTimeout(() => {
    debounceTimers.delete(executionId)
    void emitExecutionSnapshot(executionId)
  }, 200)

  debounceTimers.set(executionId, timer)
}

export function clearWorkflowExecutionPush(executionId: string): void {
  const pending = debounceTimers.get(executionId)
  if (pending) {
    clearTimeout(pending)
    debounceTimers.delete(executionId)
  }
}

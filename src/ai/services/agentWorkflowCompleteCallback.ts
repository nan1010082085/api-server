/**
 * Workflow 执行完成回调 — POST 结果到配置的 callback URL。
 */

import { createHmac } from 'node:crypto'
import { logger } from '../../utils/logger.js'
import type { IAgentWorkflowExecution } from '../models/agentWorkflow.js'

export interface WorkflowCompleteCallbackPayload {
  executionId: string
  workflowId: string
  workflowName: string
  status: string
  trigger: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  error?: string | null
  nodeRecords: Array<Record<string, unknown>>
}

export function signCompleteCallbackPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function buildCompleteCallbackPayload(
  execution: IAgentWorkflowExecution & { _id?: unknown; id?: string },
): WorkflowCompleteCallbackPayload {
  return {
    executionId: String(execution._id ?? execution.id ?? ''),
    workflowId: String(execution.workflowId),
    workflowName: execution.workflowName,
    status: execution.status,
    trigger: execution.trigger,
    startedAt: execution.startedAt.toISOString(),
    finishedAt: execution.finishedAt?.toISOString(),
    durationMs: execution.durationMs,
    error: execution.error ?? null,
    nodeRecords: execution.nodeRecords as Array<Record<string, unknown>>,
  }
}

export async function dispatchWorkflowCompleteCallback(
  execution: IAgentWorkflowExecution & { _id?: unknown; id?: string },
): Promise<void> {
  const url = execution.completeCallbackUrl?.trim()
  if (!url) return
  if (execution.status === 'running' || execution.status === 'waiting') return

  const body = JSON.stringify(buildCompleteCallbackPayload(execution))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'schema-platform-workflow-callback/1.0',
  }
  if (execution.completeCallbackSecret?.trim()) {
    headers['X-Webhook-Signature'] = signCompleteCallbackPayload(
      execution.completeCallbackSecret.trim(),
      body,
    )
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body })
    if (!res.ok) {
      logger.warn({
        msg: '[agentWorkflow] complete callback non-2xx',
        url,
        status: res.status,
        executionId: String(execution._id ?? execution.id),
      })
    }
  } catch (err) {
    logger.error({
      msg: '[agentWorkflow] complete callback failed',
      url,
      executionId: String(execution._id ?? execution.id),
      err,
    })
  }
}

export function resolveCompleteCallback(
  workflow?: { onCompleteWebhook?: { url?: string; secret?: string } | null },
  override?: { callbackUrl?: string; callbackSecret?: string },
): { url?: string; secret?: string } {
  const url = override?.callbackUrl?.trim() || workflow?.onCompleteWebhook?.url?.trim()
  const secret =
    override?.callbackSecret?.trim() || workflow?.onCompleteWebhook?.secret?.trim()
  return { url: url || undefined, secret: secret || undefined }
}

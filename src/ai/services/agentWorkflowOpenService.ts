/**
 * Agent Workflow 开放 API 服务层
 *
 * 租户级已发布 workflow 执行，鉴权由路由层 apiKeyAuth 完成。
 */

import type { ApiKeyAuthState } from '../../middleware/apiKeyAuth.js'
import {
  AgentWorkflowModel,
  AgentWorkflowExecutionModel,
} from '../models/agentWorkflow.js'
import { executeAgentWorkflow } from './agentWorkflowExecutor.js'
import {
  getAgentWorkflowExecution,
  resumeAgentWorkflowExecution,
  cancelAgentWorkflowExecution,
  toExecution,
} from './agentWorkflowService.js'
import { resolveCompleteCallback } from './agentWorkflowCompleteCallback.js'
import { resolveWorkflowGraphForOpen } from './agentWorkflowOpenGraph.js'
import { logger } from '../../utils/logger.js'

export class OpenWorkflowError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'OpenWorkflowError'
  }
}

export function assertWorkflowExecutePermission(auth: ApiKeyAuthState): void {
  const perms = auth.permissions ?? []
  if (perms.includes('*') || perms.includes('workflow:execute')) return
  throw new OpenWorkflowError('API key lacks workflow:execute permission', 'workflow_forbidden', 403)
}

export async function findPublishedWorkflowOpen(
  tenantId: string,
  opts: { workflowId?: string; slug?: string; version?: string },
) {
  const filter: Record<string, unknown> = {
    tenantId,
    status: 'published',
  }
  if (opts.workflowId) filter._id = opts.workflowId
  if (opts.slug) filter.slug = opts.slug
  const workflow = await AgentWorkflowModel.findOne(filter)
  if (!workflow) return null
  const resolved = resolveWorkflowGraphForOpen(
    workflow.toObject() as Parameters<typeof resolveWorkflowGraphForOpen>[0],
    opts.version,
  )
  if (!resolved) return null
  return { workflow, graph: resolved.graph, runVersion: resolved.version }
}

export async function startOpenWorkflowExecution(
  auth: ApiKeyAuthState,
  opts: {
    workflowId?: string
    slug?: string
    input?: Record<string, unknown>
    callbackUrl?: string
    callbackSecret?: string
    version?: string
  },
) {
  assertWorkflowExecutePermission(auth)

  if (!opts.workflowId && !opts.slug) {
    throw new OpenWorkflowError('workflowId or slug is required', 'invalid_input', 422)
  }

  const match = await findPublishedWorkflowOpen(auth.tenantId, {
    workflowId: opts.workflowId,
    slug: opts.slug,
    version: opts.version,
  })
  if (!match) return null

  const { workflow, graph, runVersion } = match

  const callback = resolveCompleteCallback(workflow, {
    callbackUrl: opts.callbackUrl,
    callbackSecret: opts.callbackSecret,
  })

  const execution = await AgentWorkflowExecutionModel.create({
    tenantId: auth.tenantId,
    workflowId: workflow._id,
    workflowName: workflow.name,
    versionId: workflow.publishId ?? null,
    version: runVersion,
    status: 'running',
    trigger: 'api',
    nodeRecords: [],
    triggeredBy: auth.userId,
    completeCallbackUrl: callback.url ?? null,
    completeCallbackSecret: callback.secret ?? null,
  })

  const executionId = String(execution._id)

  executeAgentWorkflow({
    executionId,
    graph: graph as unknown as Parameters<typeof executeAgentWorkflow>[0]['graph'],
    input: opts.input ?? {},
  }).catch((err) => {
    logger.error({ msg: '[agentWorkflow/open] execution failed', executionId, err })
  })

  return toExecution(execution.toJSON() as unknown as Record<string, unknown>)
}

export async function getOpenWorkflowExecution(executionId: string, auth: ApiKeyAuthState) {
  assertWorkflowExecutePermission(auth)
  return getAgentWorkflowExecution(executionId, auth.userId)
}

export async function resumeOpenWorkflowExecution(
  executionId: string,
  auth: ApiKeyAuthState,
  resumeValue: Record<string, unknown>,
) {
  assertWorkflowExecutePermission(auth)
  const result = await resumeAgentWorkflowExecution(executionId, auth.userId, resumeValue)
  if (!result) {
    throw new OpenWorkflowError(
      'Execution not found or not waiting',
      'execution_not_waiting',
      409,
    )
  }
  return result
}

export async function cancelOpenWorkflowExecution(
  executionId: string,
  auth: ApiKeyAuthState,
  reason?: string,
) {
  assertWorkflowExecutePermission(auth)
  return cancelAgentWorkflowExecution(executionId, auth.userId, reason)
}

/** 轮询 execution 直至终态，供 SSE stream 使用 */
export async function pollOpenWorkflowExecution(
  executionId: string,
  auth: ApiKeyAuthState,
) {
  assertWorkflowExecutePermission(auth)
  return getAgentWorkflowExecution(executionId, auth.userId)
}

export { toExecution }

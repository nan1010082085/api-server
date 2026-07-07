/**
 * Open API 执行时解析 workflow graph（latest published 或指定 version）。
 */

import type { IAgentWorkflow } from '../models/agentWorkflow.js'

export function resolveWorkflowGraphForOpen(
  workflow: IAgentWorkflow & { versions?: Array<{ version: string; graph: Record<string, unknown> }> },
  version?: string,
): { graph: Record<string, unknown>; version: string } | null {
  if (workflow.status !== 'published') return null

  const requested = version?.trim()
  if (!requested) {
    if (!workflow.publishedGraph) return null
    return {
      graph: workflow.publishedGraph as Record<string, unknown>,
      version: workflow.publishedVersion ?? workflow.version ?? '',
    }
  }

  if (workflow.publishedVersion === requested && workflow.publishedGraph) {
    return {
      graph: workflow.publishedGraph as Record<string, unknown>,
      version: requested,
    }
  }

  const snapshots = workflow.versions ?? []
  const snapshot = snapshots.find((v) => v.version === requested)
  if (snapshot?.graph) {
    return { graph: snapshot.graph as Record<string, unknown>, version: requested }
  }

  if (workflow.version === requested && workflow.draftGraph) {
    return { graph: workflow.draftGraph as Record<string, unknown>, version: requested }
  }

  return null
}

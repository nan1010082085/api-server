/**
 * Data Update Engine
 *
 * Executes data update rules for a flow instance.
 * Called by FlowEngine when a ServiceTask has serviceConfig.type === 'dataUpdate'.
 */

import type { IFlowInstance } from '../flow-models/FlowInstance.js'

export interface DataUpdateResult {
  submissionId: string
  rulesApplied: number
}

/**
 * Execute data update rules for the given flow instance.
 *
 * Reads instance.variables.submissionId to find the target submission,
 * then applies any configured update rules.
 */
export async function executeDataUpdateRules(instance: IFlowInstance): Promise<DataUpdateResult> {
  const submissionId = (instance.variables as Record<string, unknown>)?.submissionId as string | undefined

  if (!submissionId) {
    return { submissionId: '', rulesApplied: 0 }
  }

  // Future: apply configured data update rules from serviceConfig
  // For now, acknowledge the submission exists
  return {
    submissionId,
    rulesApplied: 0,
  }
}

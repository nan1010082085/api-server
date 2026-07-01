/**
 * 需求确认节点 — 通过 LangGraph interrupt 等待用户确认后进入任务规划。
 */

import { interrupt } from '@langchain/langgraph'
import type { AgentStateAnnotation } from './state.js'
import { logger } from '../../utils/logger.js'

type RequirementResumeValue =
  | boolean
  | { answers?: Record<string, string>; skipped?: boolean }
  | Record<string, string>
  | undefined

export async function requirementConfirmNode(
  state: typeof AgentStateAnnotation.State,
): Promise<Partial<typeof AgentStateAnnotation.State>> {
  const analysis = state.requirement.analysis

  if (!analysis) {
    logger.warn({ msg: '[requirementConfirm] No analysis in state, skip' })
    return {
      requirement: {
        ...state.requirement,
        needsConfirmation: false,
        status: 'confirmed',
      },
    }
  }

  const resumeValue = interrupt({
    type: 'requirement_confirm',
    message: '请确认以下需求信息',
    data: { analysis },
  }) as RequirementResumeValue

  if (resumeValue === false) {
    return {
      requirement: {
        ...state.requirement,
        userConfirmations: {},
        needsConfirmation: false,
        status: 'rejected',
      },
    }
  }

  let userConfirmations: Record<string, string> = {}

  if (typeof resumeValue === 'object' && resumeValue !== null) {
    if ('skipped' in resumeValue && resumeValue.skipped) {
      userConfirmations = {}
    } else if ('answers' in resumeValue && resumeValue.answers && typeof resumeValue.answers === 'object') {
      userConfirmations = resumeValue.answers
    } else if (!Array.isArray(resumeValue)) {
      const record = resumeValue as Record<string, unknown>
      if (!('skipped' in record) && !('answers' in record)) {
        userConfirmations = Object.fromEntries(
          Object.entries(record).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>
      }
    }
  }

  logger.info({
    msg: '[requirementConfirm] User responded',
    status: 'confirmed',
    answerCount: Object.keys(userConfirmations).length,
  })

  return {
    requirement: {
      ...state.requirement,
      userConfirmations,
      needsConfirmation: false,
      status: 'confirmed',
    },
  }
}

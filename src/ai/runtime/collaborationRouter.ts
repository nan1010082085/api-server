/**
 * Collaboration Router — runtime pure function.
 *
 * 从 graph/graph.ts afterToolsNode + afterToolsRoute 抽取协作路由逻辑，
 * 不依赖 LangGraph State。供 graph node、workflow、API 等多入口复用。
 *
 * 职责：
 * - 从工具结果中检测 request_collaboration 调用
 * - 解析协作请求参数
 * - 检查协作历史防止循环（maxRounds 默认 3）
 * - 输出下一步路由决策
 */

import { logger } from '../../utils/logger.js'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface CollaborationRouterInput {
  /** 工具调用结果列表 */
  toolResults: Array<{ toolName: string; output: any }>
  /** 当前执行的专家 ID */
  currentExpertId: string
  /** 任务链状态（可选） */
  taskChain?: {
    steps: Array<{ id: string; description: string; expertId?: string; status: string }>
    currentStepIndex: number
  }
  /** 协作历史记录（可选） */
  collaborationHistory?: CollaborationRecord[]
  /** 最大协作轮次（默认 3） */
  maxCollaborationRounds?: number
}

export interface CollaborationRecord {
  fromExpertId: string
  toExpertId: string
  reason: string
  timestamp: Date
}

export interface CollaborationRouterOutput {
  /** 下一步路由目标 */
  next: 'expert' | 'task-chain' | 'summarizer' | 'end'
  /** 目标专家 ID（next='expert' 时） */
  targetExpertId?: string
  /** 协作请求详情（检测到有效协作请求时） */
  collaborationRequest?: {
    targetExpert: string
    reason: string
    context: any
  }
}

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const COLLABORATION_TOOL_NAME = 'request_collaboration'
const DEFAULT_MAX_ROUNDS = 3

/** 合法的协作目标专家 */
const VALID_TARGETS = new Set(['editor', 'flow', 'page'])

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/**
 * 从工具结果列表中提取 request_collaboration 调用的参数。
 * 返回第一个匹配的协作请求，无匹配则返回 null。
 */
function extractCollaborationCall(
  toolResults: CollaborationRouterInput['toolResults'],
): { targetExpert: string; reason: string; context: any } | null {
  for (const result of toolResults) {
    if (result.toolName !== COLLABORATION_TOOL_NAME) continue

    // 工具 output 可能是 JSON 字符串或已解析对象
    let parsed: Record<string, unknown>
    try {
      parsed = typeof result.output === 'string'
        ? JSON.parse(result.output)
        : result.output ?? {}
    } catch {
      logger.warn({ msg: '[collaborationRouter] Failed to parse tool output', output: result.output })
      continue
    }

    // 工具返回格式：{ success, message, collaboration: { targetAgent, description, context } }
    const collaboration = parsed.collaboration as Record<string, unknown> | undefined
    const targetAgent = (collaboration?.targetAgent ?? parsed.targetAgent) as string | undefined
    const description = (collaboration?.description ?? parsed.description) as string | undefined
    const context = (collaboration?.context ?? parsed.context) as any

    if (!targetAgent || !VALID_TARGETS.has(targetAgent)) {
      logger.warn({
        msg: '[collaborationRouter] Invalid collaboration target',
        targetAgent,
      })
      continue
    }

    return {
      targetExpert: targetAgent,
      reason: description ?? '',
      context: context ?? {},
    }
  }

  return null
}

/**
 * 检查协作请求是否会导致循环。
 *
 * 检测两种情况：
 * 1. 反向边已存在（A→B 后再请求 B→A）
 * 2. 总轮次超过 maxRounds
 */
function detectCollaborationLoop(
  currentExpertId: string,
  targetExpertId: string,
  history: CollaborationRecord[],
  maxRounds: number,
): { blocked: boolean; reason?: string } {
  // 检查总轮次
  if (history.length >= maxRounds) {
    return {
      blocked: true,
      reason: `协作轮次已达上限 ${maxRounds}（历史 ${history.length} 条）`,
    }
  }

  // 检查反向边：如果 history 中已有 target→current 的记录，则 current→target 会形成循环
  const reverseExists = history.some(
    (h) => h.fromExpertId === targetExpertId && h.toExpertId === currentExpertId,
  )
  if (reverseExists) {
    return {
      blocked: true,
      reason: `检测到协作循环：${targetExpertId} 已请求过 ${currentExpertId} 协作`,
    }
  }

  return { blocked: false }
}

/**
 * 判断任务链是否还有剩余步骤。
 */
function hasRemainingChainSteps(
  taskChain: CollaborationRouterInput['taskChain'],
): boolean {
  if (!taskChain || taskChain.steps.length === 0) return false
  return taskChain.currentStepIndex + 1 < taskChain.steps.length
}

/**
 * 判断任务链是否全部完成。
 */
function isChainComplete(
  taskChain: CollaborationRouterInput['taskChain'],
): boolean {
  if (!taskChain || taskChain.steps.length === 0) return false
  return taskChain.currentStepIndex >= taskChain.steps.length
}

// ────────────────────────────────────────────
// Core
// ────────────────────────────────────────────

/**
 * 纯函数：根据工具结果和上下文决定协作路由。
 *
 * 路由优先级：
 * 1. 检测到 request_collaboration 且未被循环检测拦截 → 路由到目标专家
 * 2. 任务链有剩余步骤 → 路由到 task-chain
 * 3. 任务链已完成 → 路由到 summarizer
 * 4. 无任务链 → 路由到 end
 *
 * 与 graph.ts afterToolsNode + afterToolsRoute 的区别：
 * - 不依赖 LangGraph State / Annotation
 * - 纯输入/输出，无副作用
 * - 循环检测逻辑从 taskChainNode 合并到此处
 */
export function routeCollaboration(input: CollaborationRouterInput): CollaborationRouterOutput {
  const {
    toolResults,
    currentExpertId,
    taskChain,
    collaborationHistory = [],
    maxCollaborationRounds = DEFAULT_MAX_ROUNDS,
  } = input

  // ── 1. 检测 request_collaboration 工具调用 ──
  const collabCall = extractCollaborationCall(toolResults)

  if (collabCall) {
    logger.info({
      msg: '[collaborationRouter] Collaboration request detected',
      from: currentExpertId,
      to: collabCall.targetExpert,
      reason: collabCall.reason,
    })

    // 循环检测
    const loopCheck = detectCollaborationLoop(
      currentExpertId,
      collabCall.targetExpert,
      collaborationHistory,
      maxCollaborationRounds,
    )

    if (loopCheck.blocked) {
      logger.warn({
        msg: '[collaborationRouter] Collaboration blocked by loop detection',
        reason: loopCheck.reason,
        from: currentExpertId,
        to: collabCall.targetExpert,
      })
      // 循环被拦截，不发起协作，继续正常流程
    } else {
      return {
        next: 'expert',
        targetExpertId: collabCall.targetExpert,
        collaborationRequest: collabCall,
      }
    }
  }

  // ── 2. 任务链推进 ──
  if (taskChain && taskChain.steps.length > 0) {
    if (hasRemainingChainSteps(taskChain)) {
      logger.debug({
        msg: '[collaborationRouter] Task chain has remaining steps',
        currentStep: taskChain.currentStepIndex,
        totalSteps: taskChain.steps.length,
      })
      return { next: 'task-chain' }
    }

    if (isChainComplete(taskChain)) {
      logger.debug({ msg: '[collaborationRouter] Task chain complete, routing to summarizer' })
      return { next: 'summarizer' }
    }
  }

  // ── 3. 无任务链或任务链为空 ──
  logger.debug({ msg: '[collaborationRouter] No task chain, routing to end' })
  return { next: 'end' }
}

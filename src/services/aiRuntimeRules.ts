/**
 * 简单条件表达式求值（Flow 运行时 AI 辅助，非 LLM）。
 */

export function evaluateSimpleCondition(
  expression: string,
  variables: Record<string, unknown> = {},
): boolean {
  const trimmed = expression?.trim()
  if (!trimmed) return true
  try {
    const keys = Object.keys(variables)
    const vals = Object.values(variables)
    const fn = new Function(...keys, `return Boolean(${trimmed})`) as (...args: unknown[]) => boolean
    return Boolean(fn(...vals))
  } catch {
    return false
  }
}

export function scoreAssigneeCandidates(
  candidateUsers: string[],
  context: { workload?: Record<string, number> } = {},
): Array<{ userId: string; score: number; reason: string }> {
  const workload = context.workload ?? {}
  return candidateUsers.map((userId, index) => {
    const load = workload[userId] ?? 0
    const score = Math.max(0.3, 1 - load * 0.1 - index * 0.02)
    return {
      userId,
      userName: userId,
      score: Math.round(score * 100) / 100,
      reason: load > 3 ? '当前待办较多，仍可委派' : '候选人列表中的用户',
    }
  }).sort((a, b) => b.score - a.score)
}

export function predictApprovalOutcome(formData: Record<string, unknown> = {}): {
  passProbability: number
  estimatedDuration: number
  riskFactors: string[]
} {
  const riskFactors: string[] = []
  let passProbability = 75
  const amount = Number(formData.amount ?? formData.totalAmount ?? 0)
  if (amount > 100000) {
    passProbability -= 15
    riskFactors.push('金额超过 10 万需加强审批')
  }
  if (formData.urgent === true || formData.priority === 'high') {
    passProbability += 5
  }
  return {
    passProbability: Math.min(95, Math.max(20, passProbability)),
    estimatedDuration: amount > 50000 ? 48 : 24,
    riskFactors,
  }
}

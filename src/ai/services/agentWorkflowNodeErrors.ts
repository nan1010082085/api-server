/**
 * 从节点 output 中提取可终止工作流的错误信息。
 */

export function extractNodeOutputError(output: unknown): string | null {
  if (output == null) return null

  if (typeof output === 'string') {
    const trimmed = output.trim()
    if (!trimmed) return null
    if (/^\d{3}\s+status code/i.test(trimmed)) return trimmed
    if (/^工具执行失败:/i.test(trimmed)) return trimmed
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return extractNodeOutputError(parsed)
    } catch {
      return null
    }
  }

  if (typeof output !== 'object') return null

  const obj = output as Record<string, unknown>

  if (obj.success === false) {
    const err = obj.error ?? obj.message
    if (typeof err === 'string' && err.trim()) return err.trim()
    return '节点执行失败'
  }

  if (typeof obj.error === 'string' && obj.error.trim()) {
    return obj.error.trim()
  }

  if (typeof obj.status === 'number' && obj.status >= 400) {
    if (typeof obj.data === 'string' && obj.data.trim()) return obj.data.trim()
    return `HTTP ${obj.status}`
  }

  if (typeof obj.message === 'string' && obj.message.trim()) {
    if (obj.tool != null && /未注册|失败|error/i.test(obj.message)) {
      return obj.message.trim()
    }
  }

  return null
}

export function nodeFailure(
  message: string,
): { output: { error: string }; error: string } {
  return { output: { error: message }, error: message }
}

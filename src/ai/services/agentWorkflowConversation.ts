export interface WorkflowConversationTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
  at?: string
}

export function normalizeConversationTurns(raw: unknown): WorkflowConversationTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: WorkflowConversationTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const role = row.role
    const content = row.content
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue
    if (typeof content !== 'string' || !content.trim()) continue
    turns.push({
      role,
      content: content.trim(),
      at: typeof row.at === 'string' ? row.at : undefined,
    })
  }
  return turns
}

export function trimConversationTurns(
  turns: WorkflowConversationTurn[],
  maxTurns: number,
): WorkflowConversationTurn[] {
  if (maxTurns <= 0) return []
  return turns.slice(-maxTurns)
}

export function formatConversationForPrompt(turns: WorkflowConversationTurn[]): string {
  if (!turns.length) return '（无历史对话）'
  return turns
    .map((t) => {
      const label = t.role === 'user' ? '用户' : t.role === 'assistant' ? '助手' : '系统'
      return `${label}：${t.content}`
    })
    .join('\n')
}

export function mergeConversationSources(
  ...sources: unknown[]
): WorkflowConversationTurn[] {
  const merged: WorkflowConversationTurn[] = []
  for (const source of sources) {
    merged.push(...normalizeConversationTurns(source))
  }
  return merged
}

export function extractMessageFromContext(
  field: string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): string {
  const key = field.trim() || 'message'
  const inputObj = input as Record<string, unknown>
  const lastObj = (lastOutput ?? {}) as Record<string, unknown>
  const body = inputObj.body as Record<string, unknown> | undefined
  const raw = inputObj[key] ?? lastObj[key] ?? body?.[key]
  return raw != null ? String(raw).trim() : ''
}

export function extractAssistantContent(lastOutput: unknown): string {
  if (lastOutput == null) return ''
  if (typeof lastOutput === 'string') return lastOutput.trim()
  if (typeof lastOutput === 'object') {
    const obj = lastOutput as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text.trim()
    if (typeof obj.description === 'string') return obj.description.trim()
    if (typeof obj.message === 'string') return obj.message.trim()
  }
  try {
    return JSON.stringify(lastOutput)
  } catch {
    return ''
  }
}

export function resolveDocumentIdFromNodeData(
  data: {
    documentSource?: 'documentId' | 'inputField'
    documentId?: string
    inputField?: string
  },
  resolveTemplate: (text: string) => string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): string {
  const source = data.documentSource ?? 'inputField'
  if (source === 'documentId') {
    return resolveTemplate(data.documentId ?? '').trim()
  }
  const field = data.inputField?.trim() || 'documentId'
  const inputObj = input as Record<string, unknown>
  const lastObj = (lastOutput ?? {}) as Record<string, unknown>
  const body = inputObj.body as Record<string, unknown> | undefined
  const raw = lastObj[field] ?? inputObj[field] ?? body?.[field]
  return raw != null ? String(raw).trim() : ''
}

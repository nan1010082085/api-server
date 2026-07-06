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

export interface WorkflowFilePayload {
  filename: string
  mimetype: string
  content: Buffer
}

function readFieldValue(
  field: string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): unknown {
  const inputObj = input as Record<string, unknown>
  const lastObj = (lastOutput ?? {}) as Record<string, unknown>
  const body = inputObj.body as Record<string, unknown> | undefined
  return lastObj[field] ?? inputObj[field] ?? body?.[field]
}

function decodeFileContent(raw: unknown): Buffer | null {
  if (raw == null) return null
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof Uint8Array) return Buffer.from(raw)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const base64 = trimmed.includes(',') ? trimmed.split(',').pop() ?? '' : trimmed
    try {
      return Buffer.from(base64, 'base64')
    } catch {
      return Buffer.from(trimmed, 'utf-8')
    }
  }
  return null
}

function parseWorkflowFilePayload(raw: unknown): WorkflowFilePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const filename = String(obj.filename ?? obj.name ?? 'upload.bin').trim() || 'upload.bin'
  const mimetype = String(obj.mimetype ?? obj.mimeType ?? obj.contentType ?? 'application/octet-stream').trim()
    || 'application/octet-stream'
  const contentRaw = obj.content ?? obj.base64 ?? obj.data ?? obj.buffer
  const content = decodeFileContent(contentRaw)
  if (!content?.length) return null
  return { filename, mimetype, content }
}

export function resolveDocumentIdFromNodeData(
  data: {
    documentSource?: 'documentId' | 'inputField' | 'stream'
    documentId?: string
    inputField?: string
  },
  resolveTemplate: (text: string) => string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): string {
  const source = data.documentSource ?? 'inputField'
  if (source === 'stream') return ''
  if (source === 'documentId') {
    return resolveTemplate(data.documentId ?? '').trim()
  }
  const field = data.inputField?.trim() || 'documentId'
  const raw = readFieldValue(field, input, lastOutput)
  return raw != null ? String(raw).trim() : ''
}

export function resolveDocumentStreamFromNodeData(
  data: {
    documentSource?: 'documentId' | 'inputField' | 'stream'
    streamField?: string
  },
  input: Record<string, unknown>,
  lastOutput: unknown,
): WorkflowFilePayload | null {
  if ((data.documentSource ?? 'inputField') !== 'stream') return null
  const field = data.streamField?.trim() || 'file'
  const raw = readFieldValue(field, input, lastOutput)
  return parseWorkflowFilePayload(raw)
}

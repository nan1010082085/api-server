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

function readNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function readFieldValue(
  field: string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): unknown {
  const inputObj = input as Record<string, unknown>
  const lastObj = (lastOutput ?? {}) as Record<string, unknown>
  const body = inputObj.body as Record<string, unknown> | undefined

  if (field.includes('.')) {
    return readNestedValue(lastObj, field)
      ?? readNestedValue(inputObj, field)
      ?? (body ? readNestedValue(body, field) : undefined)
  }

  return lastObj[field] ?? inputObj[field] ?? body?.[field]
}

function resolveChatDocumentIdFallback(input: Record<string, unknown>): string {
  const fromFile = parseDocumentIdRef(input.file)
  if (fromFile) return fromFile

  const ids = input.documentIds
  if (Array.isArray(ids) && ids.length > 0) {
    const first = String(ids[0] ?? '').trim()
    if (first) return first
  }

  const attachments = input.documentAttachments
  if (Array.isArray(attachments) && attachments.length > 0) {
    const first = attachments[0]
    if (first && typeof first === 'object') {
      const docId = (first as Record<string, unknown>).documentId
      if (docId != null) {
        const normalized = String(docId).trim()
        if (normalized) return normalized
      }
    }
  }

  return ''
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

function parseDocumentIdRef(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const obj = raw as Record<string, unknown>
  const docId = obj.documentId ?? obj.id
  return docId != null ? String(docId).trim() : ''
}

async function loadDocumentFilePayload(
  documentId: string,
  userId?: string,
): Promise<WorkflowFilePayload | null> {
  const { getDocumentWithText } = await import('./documentService.js')
  const { readDocumentFile } = await import('./documentFileStorage.js')

  const doc = await getDocumentWithText(documentId, userId)
  if (!doc) return null

  const filename = String(doc.filename ?? 'upload.bin')
  const mimetype = String(doc.mimetype ?? 'application/octet-stream')

  if (doc.storagePath) {
    const content = await readDocumentFile(doc.storagePath as string)
    return { filename, mimetype, content }
  }

  if (typeof doc.text === 'string' && doc.text.length > 0 && mimetype === 'text/plain') {
    return { filename, mimetype, content: Buffer.from(doc.text, 'utf-8') }
  }

  return null
}

async function resolveDocumentIdUpload(
  documentId: string,
  userId?: string,
): Promise<WorkflowFilePayload | null> {
  if (!documentId) return null
  return loadDocumentFilePayload(documentId, userId)
}

export type DocumentSourceKind = 'documentId' | 'inputField' | 'stream' | 'api'

export function resolveDocumentIdFromNodeData(
  data: {
    documentSource?: DocumentSourceKind
    documentId?: string
    inputField?: string
  },
  resolveTemplate: (text: string) => string,
  input: Record<string, unknown>,
  lastOutput: unknown,
): string {
  const source = data.documentSource ?? 'inputField'
  if (source === 'stream' || source === 'api') return ''
  if (source === 'documentId') {
    return resolveTemplate(data.documentId ?? '').trim()
  }
  const field = data.inputField?.trim() || 'documentId'
  const raw = readFieldValue(field, input, lastOutput)
  let resolved = raw != null ? String(raw).trim() : ''
  if (!resolved && field === 'documentId') {
    resolved = resolveChatDocumentIdFallback(input)
  }
  return resolved
}

export function resolveDocumentStreamFromNodeData(
  data: {
    documentSource?: DocumentSourceKind
    streamField?: string
  },
  input: Record<string, unknown>,
  lastOutput: unknown,
): WorkflowFilePayload | null {
  if ((data.documentSource ?? 'stream') !== 'stream') return null
  const field = data.streamField?.trim() || 'file'
  const raw = readFieldValue(field, input, lastOutput)
  const payload = parseWorkflowFilePayload(raw)
  if (payload) return payload
  return null
}

/**
 * 解析工作流上传文件：优先读取 $input 中的文件流（base64），
 * 否则从 documentAttachments / documentIds / documentId 引用加载已上传文件。
 */
export async function resolveWorkflowUploadFile(
  data: {
    documentSource?: DocumentSourceKind
    streamField?: string
  },
  input: Record<string, unknown>,
  lastOutput: unknown,
  options: { userId?: string } = {},
): Promise<WorkflowFilePayload | null> {
  if ((data.documentSource ?? 'stream') !== 'stream') return null

  const fromField = resolveDocumentStreamFromNodeData(data, input, lastOutput)
  if (fromField) return fromField

  const field = data.streamField?.trim() || 'file'
  const rawField = readFieldValue(field, input, lastOutput)
  const fieldDocId = parseDocumentIdRef(rawField)
  if (fieldDocId) {
    return resolveDocumentIdUpload(fieldDocId, options.userId)
  }

  const inputObj = input
  const files = inputObj.files
  if (Array.isArray(files) && files.length > 0) {
    const fromFiles = parseWorkflowFilePayload(files[0])
    if (fromFiles) return fromFiles
    const filesDocId = parseDocumentIdRef(files[0])
    if (filesDocId) {
      const loaded = await resolveDocumentIdUpload(filesDocId, options.userId)
      if (loaded) return loaded
    }
  }

  const attachments = inputObj.documentAttachments
  if (Array.isArray(attachments) && attachments.length > 0) {
    const att = attachments[0]
    const inline = parseWorkflowFilePayload(att)
    if (inline) return inline
    const attDocId = parseDocumentIdRef(att)
    if (attDocId) {
      const loaded = await resolveDocumentIdUpload(attDocId, options.userId)
      if (loaded) return loaded
    }
  }

  const docIds = inputObj.documentIds
  if (Array.isArray(docIds) && docIds.length > 0) {
    const loaded = await resolveDocumentIdUpload(String(docIds[0]).trim(), options.userId)
    if (loaded) return loaded
  }

  if (inputObj.documentId) {
    const loaded = await resolveDocumentIdUpload(String(inputObj.documentId).trim(), options.userId)
    if (loaded) return loaded
  }

  const body = inputObj.body as Record<string, unknown> | undefined
  if (body) {
    const bodyFile = parseWorkflowFilePayload(body.file)
    if (bodyFile) return bodyFile
    const bodyDocId = parseDocumentIdRef(body.file) || (body.documentId ? String(body.documentId).trim() : '')
    if (bodyDocId) {
      const loaded = await resolveDocumentIdUpload(bodyDocId, options.userId)
      if (loaded) return loaded
    }
  }

  return null
}

/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveDocumentIdFromNodeData,
  resolveDocumentStreamFromNodeData,
  resolveWorkflowUploadFile,
} from '../services/agentWorkflowConversation.js'

vi.mock('../services/documentService.js', () => ({
  getDocumentWithText: vi.fn(),
}))

vi.mock('../services/documentFileStorage.js', () => ({
  readDocumentFile: vi.fn(),
}))

import { getDocumentWithText } from '../services/documentService.js'
import { readDocumentFile } from '../services/documentFileStorage.js'

describe('document-parse node resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads documentId from input field', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'inputField', inputField: 'documentId' },
      (text) => text,
      { documentId: 'abc123' },
      {},
    )
    expect(id).toBe('abc123')
  })

  it('reads documentId from webhook body', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'inputField', inputField: 'documentId' },
      (text) => text,
      { body: { documentId: 'from-webhook' } },
      {},
    )
    expect(id).toBe('from-webhook')
  })

  it('reads documentId from chat file reference when inputField is documentId', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'inputField', inputField: 'documentId' },
      (text) => text,
      {
        message: '请摘要这份文档',
        file: {
          documentId: 'chat-doc-1',
          filename: 'report.pdf',
          mimetype: 'application/pdf',
        },
        documentIds: ['chat-doc-1'],
      },
      {},
    )
    expect(id).toBe('chat-doc-1')
  })

  it('reads nested input field path', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'inputField', inputField: 'file.documentId' },
      (text) => text,
      {
        file: {
          documentId: 'nested-doc',
          filename: 'a.pdf',
          mimetype: 'application/pdf',
        },
      },
      {},
    )
    expect(id).toBe('nested-doc')
  })

  it('uses fixed documentId source', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'documentId', documentId: 'fixed-id' },
      (text) => text,
      {},
      {},
    )
    expect(id).toBe('fixed-id')
  })

  it('returns empty id for stream source', () => {
    const id = resolveDocumentIdFromNodeData(
      { documentSource: 'stream', streamField: 'file' },
      (text) => text,
      { file: { filename: 'a.txt', mimetype: 'text/plain', content: 'aGVsbG8=' } },
      {},
    )
    expect(id).toBe('')
  })

  it('reads file payload from stream field', () => {
    const file = resolveDocumentStreamFromNodeData(
      { documentSource: 'stream', streamField: 'file' },
      {
        file: {
          filename: 'demo.txt',
          mimetype: 'text/plain',
          content: Buffer.from('hello', 'utf-8').toString('base64'),
        },
      },
      {},
    )
    expect(file?.filename).toBe('demo.txt')
    expect(file?.mimetype).toBe('text/plain')
    expect(file?.content.toString('utf-8')).toBe('hello')
  })

  it('reads nested stream field from webhook body', () => {
    const file = resolveDocumentStreamFromNodeData(
      { documentSource: 'stream', streamField: 'upload' },
      {
        body: {
          upload: {
            filename: 'report.pdf',
            mimetype: 'application/pdf',
            base64: Buffer.from('%PDF', 'utf-8').toString('base64'),
          },
        },
      },
      {},
    )
    expect(file?.filename).toBe('report.pdf')
    expect(file?.content.length).toBeGreaterThan(0)
  })

  it('loads file from documentId reference in $input.file', async () => {
    vi.mocked(getDocumentWithText).mockResolvedValueOnce({
      filename: 'scan.png',
      mimetype: 'image/png',
      storagePath: 'docs/scan.png',
    })
    vi.mocked(readDocumentFile).mockResolvedValueOnce(Buffer.from('png-bytes'))

    const file = await resolveWorkflowUploadFile(
      { documentSource: 'stream', streamField: 'file' },
      {
        file: {
          documentId: 'doc-1',
          filename: 'scan.png',
          mimetype: 'image/png',
        },
      },
      {},
      { userId: 'user-1' },
    )

    expect(file?.filename).toBe('scan.png')
    expect(file?.content.toString('utf-8')).toBe('png-bytes')
    expect(getDocumentWithText).toHaveBeenCalledWith('doc-1', 'user-1')
  })

  it('loads file from chat documentAttachments', async () => {
    vi.mocked(getDocumentWithText).mockResolvedValueOnce({
      filename: 'note.pdf',
      mimetype: 'application/pdf',
      storagePath: 'docs/note.pdf',
    })
    vi.mocked(readDocumentFile).mockResolvedValueOnce(Buffer.from('%PDF'))

    const file = await resolveWorkflowUploadFile(
      { documentSource: 'stream' },
      {
        message: '解析这份文档',
        documentAttachments: [{
          documentId: 'doc-2',
          filename: 'note.pdf',
          mimetype: 'application/pdf',
          size: 100,
        }],
        documentIds: ['doc-2'],
      },
      {},
    )

    expect(file?.mimetype).toBe('application/pdf')
    expect(file?.content.toString('utf-8')).toBe('%PDF')
  })
})

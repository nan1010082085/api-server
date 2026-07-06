/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import {
  resolveDocumentIdFromNodeData,
  resolveDocumentStreamFromNodeData,
} from '../services/agentWorkflowConversation.js'

describe('document-parse node resolution', () => {
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
})

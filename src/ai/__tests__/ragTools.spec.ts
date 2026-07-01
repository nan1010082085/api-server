/**
 * RAG Tools tests.
 *
 * rag_search 已迁入 MCP Server（rag__search），由 mcp.spec.ts 覆盖。
 * 此文件测试 LangGraph 专有工具 rag_index（写入操作）。
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('../services/ragService.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([
    {
      schemaId: 'test-id-1', editId: 'edit-1', name: 'User Registration Form',
      type: 'form', score: 85,
      metadata: { widgetTypes: ['input'], fieldNames: ['username'], labels: ['Username'], description: 'A user registration form' },
    },
  ]),
  indexSchema: vi.fn().mockResolvedValue({ schemaId: 'test-id', action: 'created' }),
  reindexAll: vi.fn().mockResolvedValue({ total: 5, created: 3, updated: 1, skipped: 1, errors: 0 }),
}))

vi.mock('../../models/FormSchema.js', () => ({
  FormSchemaModel: { findById: vi.fn(), countDocuments: vi.fn().mockResolvedValue(5) },
}))

vi.mock('../../models/SchemaEmbedding.js', () => ({
  SchemaEmbeddingModel: { countDocuments: vi.fn().mockResolvedValue(3) },
}))

import { ragIndexTool } from '../tools/ragTools.js'

describe('RAG Tools', () => {
  describe('ragIndexTool (LangGraph 专有)', () => {
    it('has correct name and description', () => {
      expect(ragIndexTool.name).toBe('rag_index')
      expect(ragIndexTool.description).toContain('向量索引')
    })

    it('indexes a single schema', async () => {
      const raw = await ragIndexTool.invoke({ schemaId: 'test-id' })
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      expect(result.success).toBe(true)
      expect((result.data as Record<string, unknown>).action).toBe('created')
    })

    it('reindexes all schemas', async () => {
      const raw = await ragIndexTool.invoke({ reindex: true })
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      expect(result.success).toBe(true)
      expect((result.data as Record<string, unknown>).total).toBe(5)
      expect((result.data as Record<string, unknown>).created).toBe(3)
      expect(result.summary).toContain('全量重建完成')
    })

    it('fails when neither schemaId nor reindex provided', async () => {
      const raw = await ragIndexTool.invoke({ reindex: false })
      const result = typeof raw === 'string' ? JSON.parse(raw) : raw
      expect(result.success).toBe(false)
    })
  })
})

/**
 * RAG Service tests.
 *
 * Tests text extraction, content hashing, and cosine similarity logic.
 * Embedding API calls are mocked since they require external service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the embedding service before importing ragService
vi.mock('../services/embeddingService.js', () => ({
  embedText: vi.fn().mockResolvedValue({
    vector: Array.from({ length: 1536 }, () => Math.random()),
    dimensions: 1536,
  }),
  embedBatch: vi.fn().mockResolvedValue([]),
  isEmbeddingConfigured: vi.fn().mockReturnValue(true),
  EMBEDDING_DIMENSIONS: 1536,
}))

vi.mock('../services/schemaService.js', () => ({
  fuzzySearchSchemas: vi.fn(),
}))

// Mock Mongoose models
vi.mock('../../models/FormSchema.js', () => ({
  FormSchemaModel: {
    findById: vi.fn(),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}))

vi.mock('../../models/SchemaEmbedding.js', () => ({
  SchemaEmbeddingModel: {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
    create: vi.fn().mockResolvedValue({}),
    updateOne: vi.fn().mockResolvedValue({}),
    deleteOne: vi.fn().mockResolvedValue({}),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}))

import {
  extractTextForEmbedding,
  computeContentHash,
  semanticSearch,
} from '../services/ragService.js'
import { embedText, isEmbeddingConfigured } from '../services/embeddingService.js'
import { fuzzySearchSchemas } from '../services/schemaService.js'
import { FormSchemaModel } from '../../models/FormSchema.js'
import { SchemaEmbeddingModel } from '../../models/SchemaEmbedding.js'

describe('RAG Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isEmbeddingConfigured).mockReturnValue(true)
  })

  describe('extractTextForEmbedding', () => {
    it('extracts name and widget types from schema json', () => {
      const json = [
        { type: 'input', field: 'username', label: 'Username' },
        { type: 'select', field: 'role', label: 'Role' },
      ]
      const text = extractTextForEmbedding('User Form', json)
      expect(text).toContain('User Form')
      expect(text).toContain('input')
      expect(text).toContain('select')
      expect(text).toContain('Username')
      expect(text).toContain('Role')
    })

    it('handles nested children', () => {
      const json = [
        {
          type: 'card',
          children: [
            { type: 'input', field: 'name', label: 'Name' },
            { type: 'textarea', field: 'bio', label: 'Bio' },
          ],
        },
      ]
      const text = extractTextForEmbedding('Profile', json)
      expect(text).toContain('card')
      expect(text).toContain('input')
      expect(text).toContain('textarea')
      expect(text).toContain('Name')
      expect(text).toContain('Bio')
    })

    it('handles empty json', () => {
      const text = extractTextForEmbedding('Empty', [])
      expect(text).toContain('Empty')
    })

    it('handles non-array json', () => {
      const text = extractTextForEmbedding('Test', null)
      expect(text).toContain('Test')
    })

    it('extracts props.label and props.placeholder', () => {
      const json = [
        {
          type: 'input',
          props: { label: 'Email', placeholder: 'Enter email' },
        },
      ]
      const text = extractTextForEmbedding('Form', json)
      expect(text).toContain('Email')
      expect(text).toContain('Enter email')
    })
  })

  describe('computeContentHash', () => {
    it('returns consistent hash for same input', () => {
      const json = [{ type: 'input', label: 'Test' }]
      const hash1 = computeContentHash('Test Form', json)
      const hash2 = computeContentHash('Test Form', json)
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(32)
    })

    it('returns different hash for different input', () => {
      const json1 = [{ type: 'input', label: 'Test' }]
      const json2 = [{ type: 'select', label: 'Other' }]
      const hash1 = computeContentHash('Form A', json1)
      const hash2 = computeContentHash('Form B', json2)
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('semanticSearch', () => {
    it('falls back to keyword search when embedding API fails', async () => {
      vi.mocked(embedText).mockRejectedValueOnce(new Error('404 status code (no body)'))
      vi.mocked(fuzzySearchSchemas).mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          schemas: [{
            id: 'schema-1',
            name: '用户注册表单',
            type: 'form',
            status: 'published',
            score: 85,
          }],
        },
        summary: '找到 1 个相关 Schema',
      })
      vi.mocked(FormSchemaModel.find).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{
          _id: 'schema-1',
          editId: 'edit-1',
          name: '用户注册表单',
          type: 'form',
          json: [{ type: 'input', field: 'username', label: '用户名' }],
        }]),
      } as never)
      vi.mocked(SchemaEmbeddingModel.find).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      } as never)

      const results = await semanticSearch('用户注册表单')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('用户注册表单')
      expect(results[0].score).toBe(85)
    })

    it('uses keyword search when embedding is not configured', async () => {
      vi.mocked(isEmbeddingConfigured).mockReturnValueOnce(false)
      vi.mocked(fuzzySearchSchemas).mockResolvedValueOnce({
        success: true,
        data: { total: 0, schemas: [] },
        summary: '没有找到',
      })

      const results = await semanticSearch('测试')
      expect(results).toEqual([])
      expect(embedText).not.toHaveBeenCalled()
    })
  })
})

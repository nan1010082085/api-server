/**
 * RAG MCP Server — 通过 MCP 协议暴露 RAG 语义搜索工具。
 *
 * 只暴露读取类工具（rag_search）。写入类工具（rag_index）保留在 LangGraph 专有层。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { semanticSearch } from '../services/ragService.js'
import { logger } from '../../utils/logger.js'

export function createRagServer(): McpServer {
  const server = new McpServer({
    name: 'rag',
    version: '2.0.0',
  })

  server.tool(
    'rag__search',
    `基于向量智能匹配 Schema；未配置 Embedding API 时自动降级为关键词模糊匹配。使用 DeepSeek Embedding API 或 OpenAI 兼容服务生成向量，通过余弦相似度匹配，支持自然语言描述的模糊搜索。比关键词搜索更智能，能理解同义词、近义词和语义相关的内容。当用户用自然语言描述需求时优先使用此工具。

参数：query — 自然语言描述（如"一个包含用户信息和地址的表单"）；limit — 返回数量上限，默认 5；type — 按类型筛选（form/search_list）。
返回 JSON 包含 schemas 数组，每项含 score（相似度百分比）、widgetTypes、fieldNames、labels 等元数据。`,
    {
      query: z.string().describe('自然语言描述，如"一个包含用户信息和地址的表单"、"审批流程的申请页面"'),
      limit: z.number().optional().default(5).describe('返回数量上限，默认 5'),
      type: z.enum(['form', 'search_list']).optional().describe('按类型筛选'),
    },
    async ({ query, limit, type }) => {
      try {
        const results = await semanticSearch(query, { limit, type, minScore: 5 })

        const mapped = results.map((r) => ({
          id: r.schemaId,
          editId: r.editId,
          name: r.name,
          type: r.type,
          score: r.score,
          widgetTypes: r.metadata.widgetTypes,
          fieldNames: r.metadata.fieldNames,
          labels: r.metadata.labels,
          description: r.metadata.description,
        }))

        const summary = mapped.length === 0
          ? `没有找到与"${query}"语义相关的 Schema`
          : `找到 ${mapped.length} 个语义相关 Schema：${mapped.slice(0, 3).map((s) => `${s.name}（相似度 ${s.score}%）`).join('、')}${mapped.length > 3 ? '等' : ''}`

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, data: { total: mapped.length, schemas: mapped }, summary }),
          }],
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.warn({ msg: 'rag__search failed, returning empty result', error: errorMessage, query })
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: { total: 0, schemas: [] },
              summary: `没有找到与"${query}"语义相关的 Schema`,
              degraded: true,
            }),
          }],
        }
      }
    },
  )

  return server
}

/**
 * RAG 工具 — LangGraph StructuredTool format.
 *
 * 语义搜索工具（rag_search）已迁入 MCP Server（rag__search），通过 registry 获取。
 * 此文件仅保留索引写入工具（rag_index），因为写入操作不适合无状态 MCP 暴露。
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { indexSchema, reindexAll } from '../services/ragService.js'
import type { ToolResult } from './types.js'

// ────────────────────────────────────────────
// Index Management Tool（写入，保留在 LangGraph）
// ────────────────────────────────────────────

export const ragIndexTool = tool(
  async ({ schemaId, reindex }): Promise<string> => {
    try {
      if (reindex) {
        const stats = await reindexAll()
        return JSON.stringify({
          success: true,
          data: stats,
          summary: `全量重建完成：共 ${stats.total} 个 Schema，新增 ${stats.created}，更新 ${stats.updated}，跳过 ${stats.skipped}，失败 ${stats.errors}`,
        } satisfies ToolResult)
      }

      if (!schemaId) {
        return JSON.stringify({ success: false, error: '必须提供 schemaId 或 reindex=true' } satisfies ToolResult)
      }

      const idxResult = await indexSchema(schemaId)
      const actionLabel = idxResult.action === 'created' ? '新增索引'
        : idxResult.action === 'updated' ? '更新索引'
        : '索引已是最新'

      const result: ToolResult = {
        success: true,
        data: idxResult,
        summary: `Schema ${schemaId}：${actionLabel}`,
      }
      return JSON.stringify(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Index operation failed'
      return JSON.stringify({ success: false, error: message } satisfies ToolResult)
    }
  },
  {
    name: 'rag_index',
    description: `管理 Schema 向量索引。可以为单个 Schema 生成/更新向量索引，或全量重建所有索引。在 Schema 内容变更后调用此工具确保搜索索引是最新的。

参数：schemaId — 要索引的 Schema ID；reindex — 设为 true 则全量重建所有索引。
返回 JSON 包含索引操作结果（action: created/updated/skipped）。`,
    schema: z.object({
      schemaId: z.string().optional().describe('要索引的 Schema ID'),
      reindex: z.boolean().optional().default(false).describe('设为 true 则全量重建所有索引'),
    }),
  },
)

// ────────────────────────────────────────────
// RAG 专有工具集合
// ────────────────────────────────────────────

export const ragOnlyTools = [ragIndexTool]

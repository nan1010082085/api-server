/**
 * LangGraph 专有工具集合 — 不属于任何 MCP Server 的工具。
 *
 * 这些工具依赖图状态（HITL interrupt）、复合写入、LLM 调用或图路由，
 * 无法通过 MCP 协议无状态暴露，因此保留在 LangGraph 专有层。
 *
 * 工具名不带 `domain__` 前缀，与 MCP 工具区分。
 *
 * 归属：
 * - update_schema / update_flow：HITL interrupt，需要用户确认
 * - generate_schema：调用 LLM 生成 Schema
 * - save_and_bind_schema / bind_schema_to_flow_node：复合数据库写入
 * - request_collaboration：图路由协作请求
 * - rag_index：向量索引写入
 */

import { editorOnlyTools } from './editorTools.js'
import { flowOnlyTools } from './flowTools.js'
import { collaborationTools } from './collaborationTools.js'
import { ragOnlyTools } from './ragTools.js'
import type { StructuredTool } from '@langchain/core/tools'

export const langgraphOnlyTools: StructuredTool[] = [
  ...editorOnlyTools,
  ...flowOnlyTools,
  ...collaborationTools,
  ...ragOnlyTools,
]

/**
 * LangGraph 专有工具名集合，用于区分 MCP 工具和专有工具。
 */
export const LANGGRAPH_ONLY_TOOL_NAMES = new Set(
  langgraphOnlyTools.map((t) => t.name),
)

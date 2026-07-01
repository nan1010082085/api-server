/**
 * Shared tool handlers — MCP servers 和 LangGraph tools 共用的业务逻辑。
 *
 * 消除 schemaServer / editorTools / flowServer / flowTools / widgetServer 之间的重复代码。
 * 每个 handler 返回统一的 { success, data, summary } 结构。
 */

import {
  searchSchemas,
  getSchemaDetail,
  searchPublishedSchemas,
  fuzzySearchSchemas,
  findFlowReferences,
} from '../services/schemaService.js'
import {
  searchFlows,
  getFlowDetail,
  searchUsers,
  getFlowNodeSchema,
  validateFlowGraph,
} from '../services/flowService.js'
import { queryWidgets, validateWidgets } from '../services/widgetService.js'
import { getMetadata, extractTokens, extractTokensFromSchema, jaccardSimilarity } from '../services/metadataService.js'
import type { ToolResult } from './types.js'

// ────────────────────────────────────────────
// Re-export 纯函数（保持向后兼容，外部仍可从 toolHandlers 导入）
// ────────────────────────────────────────────

export { getMetadata, extractTokens, extractTokensFromSchema, jaccardSimilarity }

// ────────────────────────────────────────────
// Schema handlers（转发到 service 层）
// ────────────────────────────────────────────

export async function handleSchemaSearch(params: {
  keyword?: string; type?: 'form' | 'search_list'; limit?: number; source?: 'editor' | 'flow';
}): Promise<ToolResult> {
  return searchSchemas(params) as Promise<ToolResult>
}

export async function handleSchemaGetDetail(schemaId: string): Promise<ToolResult> {
  return getSchemaDetail(schemaId) as Promise<ToolResult>
}

export async function handleSchemaValidate(widgets: Record<string, unknown>[]): Promise<ToolResult> {
  return validateWidgets(widgets) as Promise<ToolResult>
}

export async function handleSchemaSearchPublished(params: {
  keyword?: string; type?: 'form' | 'search_list'; limit?: number;
}): Promise<ToolResult> {
  return searchPublishedSchemas(params) as Promise<ToolResult>
}

export async function handleSchemaFuzzySearch(query: string, limit = 5): Promise<ToolResult> {
  return fuzzySearchSchemas(query, limit) as Promise<ToolResult>
}

export async function handleSchemaFindFlowReferences(schemaId: string): Promise<ToolResult> {
  return findFlowReferences(schemaId) as Promise<ToolResult>
}

// ────────────────────────────────────────────
// Flow handlers（转发到 service 层）
// ────────────────────────────────────────────

export async function handleFlowSearch(params: {
  keyword?: string; status?: 'draft' | 'published' | 'archived'; category?: string; limit?: number;
}): Promise<ToolResult> {
  return searchFlows(params) as Promise<ToolResult>
}

export async function handleFlowGetDetail(flowId: string): Promise<ToolResult> {
  return getFlowDetail(flowId) as Promise<ToolResult>
}

export async function handleFlowValidate(flow: {
  nodes: Record<string, unknown>[]; edges: Record<string, unknown>[];
}): Promise<ToolResult> {
  const result = validateFlowGraph(flow)
  const summary = result.valid
    ? `流程校验通过，${flow.nodes.length} 个节点、${flow.edges.length} 条边`
    : `流程校验失败，${result.errors.length} 个错误：${result.errors.slice(0, 3).join('；')}${result.errors.length > 3 ? '等' : ''}`
  return { success: true, data: { valid: result.valid, errors: result.errors }, summary }
}

export async function handleFlowSearchUsers(params: {
  keyword?: string; role?: string; limit?: number;
}): Promise<ToolResult> {
  return searchUsers(params) as Promise<ToolResult>
}

export async function handleFlowGetNodeSchema(flowId: string, nodeId: string): Promise<ToolResult> {
  return getFlowNodeSchema(flowId, nodeId) as Promise<ToolResult>
}

// ────────────────────────────────────────────
// Widget handlers（转发到 service 层）
// ────────────────────────────────────────────

export function handleWidgetQuery(category?: string): ToolResult {
  return queryWidgets(category) as ToolResult
}

export async function handleWidgetValidate(widgets: Record<string, unknown>[]): Promise<ToolResult> {
  return validateWidgets(widgets) as Promise<ToolResult>
}

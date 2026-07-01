/**
 * Widget 工具 — 向后兼容包装函数。
 *
 * LangGraph StructuredTool 已迁入 MCP Server（widget__query、widget__validate），
 * 通过 registry 获取。此文件仅保留向后兼容的函数式调用入口，
 * 供 schemaGenerator、agentWorkflowExecutor 等内部模块使用。
 */

import { queryWidgets as queryWidgetsService, validateWidgets } from '../services/widgetService.js'

// ────────────────────────────────────────────
// 向后兼容包装
// ────────────────────────────────────────────

export function queryWidgets(category?: string) {
  const result = queryWidgetsService(category)
  return { total: result.data.total, widgets: result.data.widgets }
}

export async function validateSchema(widgets: Record<string, unknown>[]) {
  const result = await validateWidgets(widgets)
  return { valid: result.data.valid, errors: result.data.errors }
}

// widget 工具已全部迁入 MCP，无 LangGraph 专有工具
export const widgetOnlyTools: never[] = []

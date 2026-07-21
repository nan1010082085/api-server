/**
 * Widget 共享业务逻辑层。
 *
 * MCP Server 和 LangGraph 工具共同调用，消除重复代码。
 * 提供组件目录查询和组件级校验。
 */

import { getMetadata } from './metadataService.js'
import { validateWidgetSchema, type ValidationResult } from './schemaService.js'

// ────────────────────────────────────────────
// 类型定义
// ────────────────────────────────────────────

export interface WidgetSummary {
  type: string
  displayName: string
  group: string
  canHaveChildren: boolean
  description?: string
}

export interface WidgetQueryResult {
  success: boolean
  data: { total: number; widgets: WidgetSummary[] }
  summary: string
}

// ────────────────────────────────────────────
// 组件目录查询
// ────────────────────────────────────────────

/**
 * 查询 Widget 组件目录，可按分类筛选。
 * 分类取自 metadata.widgets[].group。
 */
export function queryWidgets(category?: string): WidgetQueryResult {
  const meta = getMetadata()
  const filtered = category
    ? meta.widgets.filter((w) => w.group === category)
    : meta.widgets

  const groupLabel = category ? `${category} 分组` : '全部'
  const summary = `${groupLabel}共 ${filtered.length} 个组件：${filtered.slice(0, 5).map((w) => w.displayName).join('、')}${filtered.length > 5 ? '等' : ''}`

  return {
    success: true,
    data: { total: filtered.length, widgets: filtered as WidgetSummary[] },
    summary,
  }
}

// ────────────────────────────────────────────
// 组件级校验
// ────────────────────────────────────────────

/**
 * 校验 Widget 数组的结构正确性（组件级）。
 * 复用 schemaService.validateWidgetSchema，并叠加容器嵌套规则。
 */
export async function validateWidgets(widgets: Record<string, unknown>[]): Promise<{
  success: boolean
  data: { valid: boolean; errors: Array<{ path: string; message: string }> }
  summary: string
}> {
  const result = await validateWidgetSchema(widgets)

  // 容器嵌套违规检查（与 handleSchemaValidate 保持一致）
  const CONTAINER_TYPES = new Set([
    'form', 'double-col', 'triple-col', 'quad-col', 'row-container', 'card', 'drawer', 'modal',
    'tabs', 'collapse', 'fieldset', 'group',
  ])
  const nestingErrors: Array<{ path: string; message: string }> = []
  function checkNesting(nodes: Record<string, unknown>[], parentType: string | null, path: string): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const type = node.type as string
      const nodePath = path ? `${path}[${i}]` : `[${i}]`
      const isContainer = CONTAINER_TYPES.has(type)
      if (parentType && isContainer) {
        nestingErrors.push({
          path: nodePath,
          message: `容器 "${type}" 不能嵌套在容器 "${parentType}" 内部。所有组件只允许嵌套在布局组件（grid/flex-row/tabs）内。`,
        })
      }
      if (Array.isArray(node.children)) {
        checkNesting(node.children as Record<string, unknown>[], isContainer ? type : parentType, nodePath)
      }
    }
  }
  checkNesting(widgets, null, '')

  const allErrors = [...result.errors, ...nestingErrors]
  const valid = allErrors.length === 0
  const summary = valid
    ? `Schema 校验通过，共 ${widgets.length} 个组件`
    : `Schema 校验失败，${allErrors.length} 个错误：${allErrors.slice(0, 3).map((e) => e.message).join('；')}${allErrors.length > 3 ? '等' : ''}`

  return { success: true, data: { valid, errors: allErrors }, summary }
}

export type { ValidationResult }

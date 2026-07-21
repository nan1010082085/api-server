/**
 * 测试用 mock Widget 元数据 fixture。
 *
 * 供 widgetTools / mcp / multiTurnHistory 等测试 mock metadataService.getMetadata() 使用。
 * 覆盖 container / layout / form / static / action / chart 各分组，与 editor 实际 widget 对齐。
 */

export interface MockWidget {
  type: string
  group: string
  canHaveChildren: boolean
  displayName: string
  description: string
  defaultProps: Record<string, unknown>
  keyProps: string[]
  defaultSize: { w: number; h: number } | null
  exposedValues: unknown[]
  receivableEvents: unknown[]
  eventTargets: unknown[]
  configPanels: string[]
}

export const mockWidgets: MockWidget[] = [
  // container
  { type: 'dialog', group: 'container', canHaveChildren: true, displayName: '弹窗', description: '弹窗容器', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'form', group: 'container', canHaveChildren: true, displayName: '表单', description: '表单容器', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  // layout
  { type: 'card', group: 'layout', canHaveChildren: true, displayName: '卡片', description: '卡片容器', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'divider', group: 'layout', canHaveChildren: false, displayName: '分割线', description: '分割线', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'single-col', group: 'layout', canHaveChildren: true, displayName: '单列布局', description: '单列', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'tabs', group: 'layout', canHaveChildren: true, displayName: '标签页', description: '标签页', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  // form
  { type: 'input', group: 'form', canHaveChildren: false, displayName: '输入框', description: '输入框', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'select', group: 'form', canHaveChildren: false, displayName: '选择框', description: '选择', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'number', group: 'form', canHaveChildren: false, displayName: '数字输入', description: '数字', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  { type: 'textarea', group: 'form', canHaveChildren: false, displayName: '文本域', description: '文本域', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  // static
  { type: 'text', group: 'static', canHaveChildren: false, displayName: '文本', description: '文本', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  // action
  { type: 'button', group: 'action', canHaveChildren: false, displayName: '按钮', description: '按钮', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
  // chart
  { type: 'bar-chart', group: 'chart', canHaveChildren: false, displayName: '柱状图', description: '柱状图', defaultProps: {}, keyProps: [], defaultSize: null, exposedValues: [], receivableEvents: [], eventTargets: [], configPanels: [] },
]

/** 容器类型集合（canHaveChildren=true 的 type） */
export const mockContainerTypes = mockWidgets.filter((w) => w.canHaveChildren).map((w) => w.type)

/** 构造 metadataService.getMetadata() 的返回值 */
export function buildMockMetadata() {
  return {
    version: 'test',
    generatedAt: '2026-07-21',
    widgets: mockWidgets,
    flowNodes: [],
    systems: {
      eventActionTypes: [],
      linkageTypes: [],
      containerTypes: mockContainerTypes,
      variableTypes: [],
    },
  }
}

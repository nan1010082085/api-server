/**
 * Business Schema seed registry.
 * D1 deliverables (leave + workbench) are synced via businessSchemaDeliverables.ts at seed time.
 */
import { DELIVERABLE_SCHEMA_CODES } from './businessSchemaDeliverables.js'

function stubSchema(title: string, canvas: { width: number; height: number }, widgetType = 'title'): Record<string, unknown> {
  const widgetId = `stub-${widgetType}-1`
  return {
    widgets: [
      {
        id: widgetId,
        type: widgetType,
        props: { text: title, title },
        position: { x: 24, y: 24, w: 480, h: 48, zIndex: 1 },
      },
    ],
    board: {
      canvas: {
        width: canvas.width,
        height: canvas.height,
        widthUnit: 'px',
        heightUnit: 'px',
        backgroundColor: '#f5f7fa',
        padding: '16px',
      },
      variables: [],
      events: [],
    },
  }
}

/** Placeholder until syncDeliverableSchemas runs (same canvas sizes as deliverables). */
function deliverablePlaceholder(canvas: { width: number; height: number }): Record<string, unknown> {
  return {
    widgets: [],
    board: {
      canvas: {
        width: canvas.width,
        height: canvas.height,
        widthUnit: 'px',
        heightUnit: 'px',
        backgroundColor: '#f5f7fa',
        padding: '16px',
      },
      variables: [],
      events: [],
    },
  }
}

export interface BusinessSchemaSeedSpec {
  code: string
  name: string
  type: 'form' | 'search_list' | 'layout' | 'table' | 'chart' | 'business' | 'report' | 'other'
  json: Record<string, unknown>
}

export const BUSINESS_SCHEMA_SEEDS: BusinessSchemaSeedSpec[] = [
  {
    code: 'dashboard-workbench',
    name: '工作台',
    type: 'business',
    json: deliverablePlaceholder({ width: 1920, height: 1080 }),
  },
  {
    code: 'hr-leave-apply',
    name: '请假申请',
    type: 'form',
    json: deliverablePlaceholder({ width: 960, height: 1200 }),
  },
  {
    code: 'hr-leave-list',
    name: '请假台账',
    type: 'search_list',
    json: deliverablePlaceholder({ width: 1440, height: 900 }),
  },
  {
    code: 'hr-leave-detail',
    name: '请假详情',
    type: 'layout',
    json: deliverablePlaceholder({ width: 1440, height: 1400 }),
  },
  {
    code: 'hr-leave-stats',
    name: '请假统计',
    type: 'chart',
    json: deliverablePlaceholder({ width: 1920, height: 900 }),
  },
  {
    code: 'sys-user-mgmt',
    name: '用户管理',
    type: 'business',
    json: stubSchema('用户管理（Phase 1 占位）', { width: 1440, height: 900 }, 'user-management'),
  },
  {
    code: 'sys-role-mgmt',
    name: '角色管理',
    type: 'business',
    json: stubSchema('角色管理（Phase 1 占位）', { width: 1440, height: 900 }),
  },
  {
    code: 'sys-dept-mgmt',
    name: '部门管理',
    type: 'business',
    json: stubSchema('部门管理（Phase 1 占位）', { width: 1440, height: 900 }),
  },
]

export const LEAVE_FLOW_DEFINITION_NAME = '请假审批'

/** @internal re-export for seed sync */
export { DELIVERABLE_SCHEMA_CODES }

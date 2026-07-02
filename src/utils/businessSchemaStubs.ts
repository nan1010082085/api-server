/**
 * Business Schema seed registry.
 * Deliverables are synced via businessSchemaDeliverables.ts at seed time.
 */
import { DELIVERABLE_SCHEMA_CODES } from './businessSchemaDeliverables.js'
import { buildExtendedSchemaSeeds } from './business-deliverables/extendedSeeds.js'

export type { BusinessSchemaSeedSpec } from './business-deliverables/types.js'
import type { BusinessSchemaSeedSpec } from './business-deliverables/types.js'

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
    json: deliverablePlaceholder({ width: 1440, height: 900 }),
  },
  {
    code: 'sys-role-mgmt',
    name: '角色管理',
    type: 'business',
    json: deliverablePlaceholder({ width: 1440, height: 900 }),
  },
  {
    code: 'sys-dept-mgmt',
    name: '部门管理',
    type: 'business',
    json: deliverablePlaceholder({ width: 1440, height: 900 }),
  },
  ...buildExtendedSchemaSeeds(deliverablePlaceholder),
]

export const LEAVE_FLOW_DEFINITION_NAME = '请假审批'

/** @internal re-export for seed sync */
export { DELIVERABLE_SCHEMA_CODES }

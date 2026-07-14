/**
 * Built-in BPMN graph builders for business platform flow seeds.
 */
import { BpmnElementType } from '@/shared/flow'

interface FlowNode {
  id: string
  shape: string
  x: number
  y: number
  width: number
  height: number
  data: Record<string, unknown>
}

interface FlowEdge {
  id: string
  shape: string
  source: { cell: string }
  target: { cell: string }
  data: Record<string, unknown>
}

function start(id: string, x: number, y: number): FlowNode {
  return { id, shape: 'bpmn-start-event', x, y, width: 200, height: 44, data: { bpmnType: BpmnElementType.StartEvent, label: '开始' } }
}

function end(id: string, x: number, y: number): FlowNode {
  return { id, shape: 'bpmn-end-event', x, y, width: 200, height: 44, data: { bpmnType: BpmnElementType.EndEvent, label: '结束' } }
}

function userTask(id: string, label: string, x: number, y: number, role: string): FlowNode {
  return {
    id,
    shape: 'bpmn-user-task',
    x,
    y,
    width: 200,
    height: 48,
    data: {
      bpmnType: BpmnElementType.UserTask,
      label,
      assigneeType: 'role',
      candidateRoles: [role],
      approvalMode: 'single',
      rejectPolicy: 'reject-on-any',
    },
  }
}

function gateway(id: string, label: string, x: number, y: number, defaultFlow?: string): FlowNode {
  return {
    id,
    shape: 'bpmn-exclusive-gateway',
    x,
    y,
    width: 48,
    height: 48,
    data: {
      bpmnType: BpmnElementType.ExclusiveGateway,
      label,
      gatewayDirection: 'diverging',
      ...(defaultFlow ? { defaultFlow } : {}),
    },
  }
}

function edge(id: string, from: string, to: string, data: Record<string, unknown> = {}): FlowEdge {
  return { id, shape: 'bpmn-sequence-flow', source: { cell: from }, target: { cell: to }, data }
}

export interface BuiltinFlowTemplateSpec {
  name: string
  description: string
  category: string
  tags: string[]
  graph: { nodes: FlowNode[]; edges: FlowEdge[] }
}

export const LEAVE_FLOW_NAME = '请假审批'
export const TRIP_FLOW_NAME = '出差审批'
export const EXPENSE_FLOW_NAME = '报销审批'
export const PURCHASE_FLOW_NAME = '采购审批'
export const OVERTIME_FLOW_NAME = '加班审批'
export const GOV_PARALLEL_FLOW_NAME = '政务并联审批'
export const SEAL_FLOW_NAME = '用印审批'
export const ONBOARD_FLOW_NAME = '入职审批'
export const RESIGN_FLOW_NAME = '离职审批'
export const DOC_FLOW_NAME = '公文审批'
export const RECRUIT_FLOW_NAME = '招聘需求审批'
export const RECRUIT_OFFER_FLOW_NAME = 'Offer审批'
export const ASSET_FLOW_NAME = '资产领用审批'

export const BUILTIN_FLOW_TEMPLATE_SPECS: BuiltinFlowTemplateSpec[] = [
  {
    name: LEAVE_FLOW_NAME,
    description: '标准请假审批：部门经理 → HR',
    category: '人事',
    tags: ['请假', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        userTask('hr-approve', 'HR 审批', 580, 176, 'hr'),
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-approve'),
        edge('e2', 'dept-approve', 'hr-approve'),
        edge('e3', 'hr-approve', 'end'),
      ],
    },
  },
  {
    name: TRIP_FLOW_NAME,
    description: '出差申请：部门经理审批',
    category: 'OA',
    tags: ['出差', 'OA'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        end('end', 580, 178),
      ],
      edges: [edge('e1', 'start', 'dept-approve'), edge('e2', 'dept-approve', 'end')],
    },
  },
  {
    name: EXPENSE_FLOW_NAME,
    description: '报销审批：经理 → 金额网关 → VP/财务',
    category: '财务',
    tags: ['报销', '金额网关'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('manager-approve', '经理审批', 340, 176, 'department_manager'),
        gateway('gw-amount', '金额判断', 580, 176, 'e4'),
        userTask('vp-approve', 'VP 审批', 720, 76, 'vp'),
        userTask('finance-approve', '财务审批', 720, 276, 'finance'),
        end('end', 960, 178),
      ],
      edges: [
        edge('e1', 'start', 'manager-approve'),
        edge('e2', 'manager-approve', 'gw-amount'),
        edge('e3', 'gw-amount', 'vp-approve', { label: '>5000', conditionExpression: 'totalAmount > 5000' }),
        edge('e4', 'gw-amount', 'finance-approve', { label: '<=5000', conditionExpression: 'totalAmount <= 5000', isDefault: true }),
        edge('e5', 'vp-approve', 'finance-approve'),
        edge('e6', 'finance-approve', 'end'),
      ],
    },
  },
  {
    name: PURCHASE_FLOW_NAME,
    description: '采购审批：经理 → 金额网关 → VP/财务',
    category: '财务',
    tags: ['采购', '金额网关'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        gateway('gw-amount', '金额判断', 580, 176, 'e4'),
        userTask('vp-approve', 'VP 审批', 720, 76, 'vp'),
        userTask('finance-confirm', '财务确认', 720, 276, 'finance'),
        end('end', 960, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-approve'),
        edge('e2', 'dept-approve', 'gw-amount'),
        edge('e3', 'gw-amount', 'vp-approve', { label: '>10000', conditionExpression: 'totalAmount > 10000' }),
        edge('e4', 'gw-amount', 'finance-confirm', { label: '<=10000', conditionExpression: 'totalAmount <= 10000', isDefault: true }),
        edge('e5', 'vp-approve', 'finance-confirm'),
        edge('e6', 'finance-confirm', 'end'),
      ],
    },
  },
  {
    name: OVERTIME_FLOW_NAME,
    description: '加班申请：部门经理审批',
    category: '人事',
    tags: ['加班', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        end('end', 580, 178),
      ],
      edges: [edge('e1', 'start', 'dept-approve'), edge('e2', 'dept-approve', 'end')],
    },
  },
  {
    name: GOV_PARALLEL_FLOW_NAME,
    description: '政务并联审批（F-02 会签）',
    category: '政务',
    tags: ['政务', '会签'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('accept', '窗口受理', 340, 176, 'department_manager'),
        {
          id: 'parallel-sign',
          shape: 'bpmn-user-task',
          x: 580,
          y: 176,
          width: 200,
          height: 48,
          data: {
            bpmnType: BpmnElementType.UserTask,
            label: '并联会签',
            assigneeType: 'role',
            candidateRoles: ['department_manager', 'hr', 'finance'],
            approvalMode: 'multi',
            multiInstanceType: 'parallel',
            rejectPolicy: 'reject-on-any',
          },
        },
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'accept'),
        edge('e2', 'accept', 'parallel-sign'),
        edge('e3', 'parallel-sign', 'end'),
      ],
    },
  },
  {
    name: SEAL_FLOW_NAME,
    description: '用印申请：部门经理 + 行政审批',
    category: 'OA',
    tags: ['用印', 'OA'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        userTask('admin-approve', '行政审批', 580, 176, 'admin'),
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-approve'),
        edge('e2', 'dept-approve', 'admin-approve'),
        edge('e3', 'admin-approve', 'end'),
      ],
    },
  },
  {
    name: ONBOARD_FLOW_NAME,
    description: '入职办理：HR 审批',
    category: '人事',
    tags: ['入职', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('hr-approve', 'HR 审批', 340, 176, 'hr'),
        end('end', 580, 178),
      ],
      edges: [edge('e1', 'start', 'hr-approve'), edge('e2', 'hr-approve', 'end')],
    },
  },
  {
    name: RESIGN_FLOW_NAME,
    description: '离职办理：部门经理 + HR 审批',
    category: '人事',
    tags: ['离职', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        userTask('hr-approve', 'HR 审批', 580, 176, 'hr'),
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-approve'),
        edge('e2', 'dept-approve', 'hr-approve'),
        edge('e3', 'hr-approve', 'end'),
      ],
    },
  },
  {
    name: DOC_FLOW_NAME,
    description: '公文流转：部门核稿 + 领导签发',
    category: 'OA',
    tags: ['公文', 'OA'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-review', '部门核稿', 340, 176, 'department_manager'),
        userTask('leader-sign', '领导签发', 580, 176, 'admin'),
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-review'),
        edge('e2', 'dept-review', 'leader-sign'),
        edge('e3', 'leader-sign', 'end'),
      ],
    },
  },
  {
    name: RECRUIT_FLOW_NAME,
    description: '招聘需求：部门经理审批',
    category: '人事',
    tags: ['招聘', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        end('end', 580, 178),
      ],
      edges: [edge('e1', 'start', 'dept-approve'), edge('e2', 'dept-approve', 'end')],
    },
  },
  {
    name: RECRUIT_OFFER_FLOW_NAME,
    description: 'Offer 审批：部门经理 → HR',
    category: '人事',
    tags: ['招聘', 'Offer', '人事'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        userTask('hr-approve', 'HR 审批', 580, 176, 'hr'),
        end('end', 820, 178),
      ],
      edges: [
        edge('e1', 'start', 'dept-approve'),
        edge('e2', 'dept-approve', 'hr-approve'),
        edge('e3', 'hr-approve', 'end'),
      ],
    },
  },
  {
    name: ASSET_FLOW_NAME,
    description: '资产领用：部门经理审批',
    category: 'OA',
    tags: ['资产', 'OA'],
    graph: {
      nodes: [
        start('start', 100, 178),
        userTask('dept-approve', '部门经理审批', 340, 176, 'department_manager'),
        end('end', 580, 178),
      ],
      edges: [edge('e1', 'start', 'dept-approve'), edge('e2', 'dept-approve', 'end')],
    },
  },
]

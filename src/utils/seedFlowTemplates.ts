import { BpmnElementType } from '@schema-platform/flow-shared'
import { FlowTemplateModel } from '../flow-models/FlowTemplate.js'

const LEAVE_TEMPLATE = {
  name: '请假审批',
  description: '标准请假审批流程：员工提交 → 部门经理审批 → HR 备案',
  category: '人事',
  tags: ['请假', '人事', '审批'],
  graph: {
    nodes: [
      {
        id: 'start',
        shape: 'bpmn-start-event',
        x: 100,
        y: 178,
        width: 200,
        height: 44,
        data: { bpmnType: BpmnElementType.StartEvent, label: '开始' },
      },
      {
        id: 'dept-approve',
        shape: 'bpmn-user-task',
        x: 340,
        y: 176,
        width: 200,
        height: 48,
        data: {
          bpmnType: BpmnElementType.UserTask,
          label: '部门经理审批',
          assigneeType: 'role',
          assignee: 'department_manager',
          approvalMode: 'single',
          rejectPolicy: 'reject-on-any',
        },
      },
      {
        id: 'hr-approve',
        shape: 'bpmn-user-task',
        x: 580,
        y: 176,
        width: 200,
        height: 48,
        data: {
          bpmnType: BpmnElementType.UserTask,
          label: 'HR 审批',
          assigneeType: 'role',
          assignee: 'hr',
          approvalMode: 'single',
          rejectPolicy: 'reject-on-any',
        },
      },
      {
        id: 'end',
        shape: 'bpmn-end-event',
        x: 820,
        y: 178,
        width: 200,
        height: 44,
        data: { bpmnType: BpmnElementType.EndEvent, label: '结束' },
      },
    ],
    edges: [
      { id: 'e1', shape: 'bpmn-sequence-flow', source: { cell: 'start' }, target: { cell: 'dept-approve' }, data: { label: '' } },
      { id: 'e2', shape: 'bpmn-sequence-flow', source: { cell: 'dept-approve' }, target: { cell: 'hr-approve' }, data: { label: '' } },
      { id: 'e3', shape: 'bpmn-sequence-flow', source: { cell: 'hr-approve' }, target: { cell: 'end' }, data: { label: '' } },
    ],
  },
}

/**
 * Ensure built-in leave flow template exists (idempotent).
 */
export async function seedBuiltinFlowTemplates(): Promise<void> {
  const existing = await FlowTemplateModel.findOne({ name: LEAVE_TEMPLATE.name, isBuiltin: true })
  if (existing) {
    await FlowTemplateModel.updateOne(
      { _id: existing._id },
      {
        $set: {
          graph: LEAVE_TEMPLATE.graph,
          description: LEAVE_TEMPLATE.description,
          category: LEAVE_TEMPLATE.category,
          tags: LEAVE_TEMPLATE.tags,
        },
      },
    )
    return
  }

  await FlowTemplateModel.create({
    ...LEAVE_TEMPLATE,
    isBuiltin: true,
    createdBy: 'system',
  })
  console.log('[seed] Flow template created: 请假审批')
}

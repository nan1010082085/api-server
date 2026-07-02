/**
 * HR-07 离职办理 — L3 apply + list + detail
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildCrudSubmissionListPage } from './crudSubmissionListPage.js'
import { buildFlowSubmissionApplyPage, buildFlowSubmissionDetailPage } from './flowSubmissionPages.js'

const STATUS_OPTIONS = [
  { label: '审批中', value: 'submitted' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

const STATUS_COLOR_MAP: Record<string, string> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const RESIGN_TYPE_OPTIONS = [
  { label: '主动离职', value: 'voluntary' },
  { label: '协商离职', value: 'mutual' },
  { label: '辞退', value: 'dismissal' },
]

function requiredRule(message: string) {
  return [{ required: true, message, trigger: 'blur' }]
}

function listActionColumn() {
  return {
    prop: 'action',
    label: '操作',
    width: 160,
    fixed: 'right' as const,
    render: 'buttons',
    buttons: [
      { key: 'view', label: '查看', type: 'primary', size: 'small' },
      { key: 'approve', label: '审批', type: 'success', size: 'small' },
    ],
  }
}

function resignDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '姓名', field: 'employeeName', type: 'text' },
    { label: '部门', field: 'department', type: 'text' },
    { label: '离职日期', field: 'resignDate', type: 'text' },
    {
      label: '离职类型',
      field: 'resignType',
      type: 'tag',
      options: RESIGN_TYPE_OPTIONS.map((o) => ({ ...o, color: o.value === 'dismissal' ? 'danger' : 'warning' })),
    },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '交接说明', field: 'handoverNote', type: 'text', span: 2 },
    { label: '离职原因', field: 'reason', type: 'text', span: 2 },
  ]
}

/** HR-07 离职申请 — P-02 */
export function buildHrResignApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'hr-resign',
    title: '离职办理',
    titleWidgetId: 'resign-apply-title',
    applySchemaCode: 'hr-resign-apply',
    listSchemaCode: 'hr-resign-list',
    refs,
    boardHeight: 780,
    fields: [
      { field: 'employeeName', label: '姓名', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 400, h: 40 } },
      { field: 'department', label: '部门', validationRules: requiredRule('必填'), position: { x: 480, y: 120, w: 400, h: 40 } },
      { field: 'resignDate', label: '离职日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      {
        field: 'resignType',
        label: '离职类型',
        type: 'select',
        name: 'FgSelect',
        options: RESIGN_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 180, w: 400, h: 40 },
      },
      { field: 'handoverNote', label: '交接说明', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 832, h: 100 } },
      { field: 'reason', label: '离职原因', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 360, w: 832, h: 100 } },
    ],
  })
}

/** HR-07b 离职台账 */
export function buildHrResignListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'hr-resign-list',
    title: '离职台账',
    tableId: 'resign-table',
    applySchemaCode: 'hr-resign-apply',
    detailSchemaCode: 'hr-resign-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.employeeName', label: '姓名', minWidth: 100, render: 'text' },
      { prop: 'data.department', label: '部门', minWidth: 120, render: 'text' },
      { prop: 'data.resignDate', label: '离职日期', width: 110, render: 'text' },
      { prop: 'data.resignType', label: '类型', width: 100, render: 'tag', options: RESIGN_TYPE_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/姓名/部门' },
      { field: 'resignType', label: '离职类型', type: 'select', options: RESIGN_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '离职详情',
      detailApiUrl: '/business/hr/resign/detail',
      descriptionItems: resignDetailItems(),
      exportFilename: '离职台账',
    },
  })
}

export function buildHrResignDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'resign-detail',
    title: '离职详情',
    detailApiUrl: '/business/hr/resign/detail',
    descriptionItems: resignDetailItems(),
  })
}

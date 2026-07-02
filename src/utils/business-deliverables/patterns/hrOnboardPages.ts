/**
 * HR-06 入职办理 — L3 apply + list + detail
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

const YES_NO_OPTIONS = [
  { label: '需要', value: 'yes' },
  { label: '不需要', value: 'no' },
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

function onboardDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '姓名', field: 'employeeName', type: 'text' },
    { label: '岗位', field: 'position', type: 'text' },
    { label: '部门', field: 'department', type: 'text' },
    { label: '入职日期', field: 'onboardDate', type: 'text' },
    {
      label: '设备需求',
      field: 'needEquipment',
      type: 'tag',
      options: YES_NO_OPTIONS.map((o) => ({ ...o, color: o.value === 'yes' ? 'warning' : 'info' })),
    },
    {
      label: '账号需求',
      field: 'needAccount',
      type: 'tag',
      options: YES_NO_OPTIONS.map((o) => ({ ...o, color: o.value === 'yes' ? 'warning' : 'info' })),
    },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

/** HR-06 入职申请 — P-02 */
export function buildHrOnboardApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'hr-onboard',
    title: '入职办理',
    titleWidgetId: 'onboard-apply-title',
    applySchemaCode: 'hr-onboard-apply',
    listSchemaCode: 'hr-onboard-list',
    refs,
    boardHeight: 720,
    fields: [
      { field: 'employeeName', label: '姓名', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 400, h: 40 } },
      { field: 'position', label: '岗位', validationRules: requiredRule('必填'), position: { x: 480, y: 120, w: 400, h: 40 } },
      { field: 'department', label: '部门', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'onboardDate', label: '入职日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      {
        field: 'needEquipment',
        label: '设备需求',
        type: 'select',
        name: 'FgSelect',
        options: YES_NO_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 240, w: 400, h: 40 },
      },
      {
        field: 'needAccount',
        label: '账号需求',
        type: 'select',
        name: 'FgSelect',
        options: YES_NO_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 240, w: 400, h: 40 },
      },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 300, w: 832, h: 80 } },
    ],
  })
}

/** HR-06b 入职台账 */
export function buildHrOnboardListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'hr-onboard-list',
    title: '入职台账',
    tableId: 'onboard-table',
    applySchemaCode: 'hr-onboard-apply',
    detailSchemaCode: 'hr-onboard-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.employeeName', label: '姓名', minWidth: 100, render: 'text' },
      { prop: 'data.position', label: '岗位', minWidth: 120, render: 'text' },
      { prop: 'data.department', label: '部门', minWidth: 120, render: 'text' },
      { prop: 'data.onboardDate', label: '入职日期', width: 110, render: 'text' },
      { prop: 'data.needEquipment', label: '设备', width: 80, render: 'tag', options: YES_NO_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/姓名/岗位/部门' },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '入职详情',
      detailApiUrl: '/business/hr/onboard/detail',
      descriptionItems: onboardDetailItems(),
      exportFilename: '入职台账',
    },
  })
}

export function buildHrOnboardDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'onboard-detail',
    title: '入职详情',
    detailApiUrl: '/business/hr/onboard/detail',
    descriptionItems: onboardDetailItems(),
  })
}

/**
 * GA-01/02/03 政务事项 — L3 apply + list + detail
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

const APPLICANT_TYPE_OPTIONS = [
  { label: '个人', value: 'individual' },
  { label: '企业', value: 'enterprise' },
]

const CASE_TYPE_OPTIONS = [
  { label: '行政许可', value: 'license' },
  { label: '公共服务', value: 'service' },
  { label: '投诉建议', value: 'complaint' },
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

function caseDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '受理人', field: 'applicantName', type: 'text' },
    {
      label: '申请人类型',
      field: 'applicantType',
      type: 'tag',
      options: APPLICANT_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '姓名/企业名称', field: 'partyName', type: 'text' },
    { label: '证件号', field: 'idNumber', type: 'text' },
    { label: '联系方式', field: 'contact', type: 'text' },
    {
      label: '事项类型',
      field: 'caseType',
      type: 'tag',
      options: CASE_TYPE_OPTIONS.map((o) => ({ ...o, color: 'info' })),
    },
    { label: '承诺时限(工作日)', field: 'deadlineDays', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

/** GA-01 事项受理 — P-02 */
export function buildGovCaseApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'gov-case',
    title: '事项受理',
    titleWidgetId: 'gov-case-apply-title',
    applySchemaCode: 'gov-case-apply',
    listSchemaCode: 'gov-case-list',
    refs,
    boardHeight: 780,
    fields: [
      {
        field: 'applicantType',
        label: '申请人类型',
        type: 'select',
        name: 'FgSelect',
        options: APPLICANT_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 120, w: 400, h: 40 },
      },
      { field: 'applicantName', label: '姓名/企业名称', validationRules: requiredRule('必填'), position: { x: 480, y: 120, w: 400, h: 40 } },
      { field: 'idNumber', label: '证件号', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'contact', label: '联系方式', validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      {
        field: 'caseType',
        label: '事项类型',
        type: 'select',
        name: 'FgSelect',
        options: CASE_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 240, w: 400, h: 40 },
      },
      { field: 'deadlineDays', label: '承诺时限(工作日)', type: 'number', name: 'FgNumber', props: { min: 1 }, validationRules: requiredRule('必填'), position: { x: 480, y: 240, w: 400, h: 40 } },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, position: { x: 48, y: 300, w: 832, h: 100 } },
    ],
  })
}

/** GA-02 办件台账 */
export function buildGovCaseListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'gov-case-list',
    title: '事项台账',
    tableId: 'gov-case-table',
    applySchemaCode: 'gov-case-apply',
    detailSchemaCode: 'gov-case-detail',
    refs,
    columns: [
      { prop: '_id', label: '办件号', minWidth: 120, render: 'link' },
      { prop: 'data.caseType', label: '事项类型', width: 110, render: 'tag', options: CASE_TYPE_OPTIONS },
      { prop: 'data.applicantName', label: '申请人', minWidth: 120, render: 'text' },
      { prop: 'data.applicantType', label: '类型', width: 90, render: 'tag', options: APPLICANT_TYPE_OPTIONS },
      { prop: 'data.deadlineDays', label: '承诺(天)', width: 90, align: 'center', render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '受理时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '办件号/申请人/证件号' },
      { field: 'caseType', label: '事项类型', type: 'select', options: CASE_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '办件详情',
      detailApiUrl: '/business/gov/case/detail',
      descriptionItems: caseDetailItems(),
      exportFilename: '政务办件台账',
    },
  })
}

/** GA-03 办件详情 — P-03 + FlowTimeline */
export function buildGovCaseDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'gov-case',
    title: '政务事项详情',
    detailApiUrl: '/business/gov/case/detail',
    descriptionItems: caseDetailItems(),
  })
}

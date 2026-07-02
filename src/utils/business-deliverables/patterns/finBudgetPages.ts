/**
 * FI-08 预算编制 — L3 apply + list + detail
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

const BUDGET_YEAR_OPTIONS = [
  { label: '2025', value: '2025' },
  { label: '2026', value: '2026' },
  { label: '2027', value: '2027' },
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

function budgetDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '编制人', field: 'applicantName', type: 'text' },
    { label: '预算年度', field: 'budgetYear', type: 'text' },
    { label: '部门', field: 'department', type: 'text' },
    { label: '预算科目', field: 'subject', type: 'text' },
    { label: '编制金额', field: 'budgetAmount', type: 'text', prefix: '¥' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '编制说明', field: 'description', type: 'text', span: 2 },
  ]
}

export function buildFinBudgetEditPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'fin-budget',
    title: '预算编制',
    titleWidgetId: 'budget-edit-title',
    applySchemaCode: 'fin-budget-edit',
    listSchemaCode: 'fin-budget-list',
    refs,
    boardHeight: 720,
    fields: [
      {
        field: 'budgetYear',
        label: '预算年度',
        type: 'select',
        name: 'FgSelect',
        options: BUDGET_YEAR_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 120, w: 400, h: 40 },
      },
      { field: 'department', label: '部门', validationRules: requiredRule('必填'), position: { x: 480, y: 120, w: 400, h: 40 } },
      { field: 'subject', label: '预算科目', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 832, h: 40 } },
      { field: 'budgetAmount', label: '编制金额', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'description', label: '编制说明', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 300, w: 832, h: 100 } },
    ],
  })
}

export function buildFinBudgetListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'fin-budget-list',
    title: '预算编制台账',
    tableId: 'budget-table',
    applySchemaCode: 'fin-budget-edit',
    detailSchemaCode: 'fin-budget-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '编制人', minWidth: 100, render: 'text' },
      { prop: 'data.budgetYear', label: '年度', width: 80, render: 'text' },
      { prop: 'data.department', label: '部门', minWidth: 120, render: 'text' },
      { prop: 'data.subject', label: '科目', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.budgetAmount', label: '金额', width: 110, align: 'right', render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '编制时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/部门/科目' },
      { field: 'budgetYear', label: '预算年度', type: 'select', options: BUDGET_YEAR_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '预算详情',
      detailApiUrl: '/business/fin/budget/detail',
      descriptionItems: budgetDetailItems(),
      exportFilename: '预算编制台账',
    },
  })
}

export function buildFinBudgetDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'budget-detail',
    title: '预算详情',
    detailApiUrl: '/business/fin/budget/detail',
    descriptionItems: budgetDetailItems(),
  })
}

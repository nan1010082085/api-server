/**
 * FI-13 发票登记 — L3 apply + list + detail
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

const INVOICE_TYPE_OPTIONS = [
  { label: '进项', value: 'input' },
  { label: '销项', value: 'output' },
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

function invoiceDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '登记人', field: 'applicantName', type: 'text' },
    { label: '发票号码', field: 'invoiceNo', type: 'text' },
    {
      label: '发票类型',
      field: 'invoiceType',
      type: 'tag',
      options: INVOICE_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '价税合计', field: 'amount', type: 'text', prefix: '¥' },
    { label: '税额', field: 'taxAmount', type: 'text', prefix: '¥' },
    { label: '开票日期', field: 'issueDate', type: 'text' },
    { label: '销方/购方', field: 'vendorName', type: 'text' },
    { label: '关联报销单', field: 'relatedExpenseNo', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
  ]
}

export function buildFinInvoiceRegisterPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'fin-invoice',
    title: '发票登记',
    titleWidgetId: 'invoice-register-title',
    applySchemaCode: 'fin-invoice-register',
    listSchemaCode: 'fin-invoice-list',
    refs,
    boardHeight: 780,
    fields: [
      { field: 'invoiceNo', label: '发票号码', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 400, h: 40 } },
      {
        field: 'invoiceType',
        label: '发票类型',
        type: 'select',
        name: 'FgSelect',
        options: INVOICE_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 120, w: 400, h: 40 },
      },
      { field: 'amount', label: '价税合计', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'taxAmount', label: '税额', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'issueDate', label: '开票日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'vendorName', label: '销方/购方名称', validationRules: requiredRule('必填'), position: { x: 480, y: 240, w: 400, h: 40 } },
      { field: 'relatedExpenseNo', label: '关联报销单号', position: { x: 48, y: 300, w: 832, h: 40 } },
    ],
  })
}

export function buildFinInvoiceListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'fin-invoice-list',
    title: '发票台账',
    tableId: 'invoice-table',
    applySchemaCode: 'fin-invoice-register',
    detailSchemaCode: 'fin-invoice-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'data.invoiceNo', label: '发票号', minWidth: 140, render: 'text' },
      { prop: 'data.invoiceType', label: '类型', width: 90, render: 'tag', options: INVOICE_TYPE_OPTIONS },
      { prop: 'data.amount', label: '价税合计', width: 110, align: 'right', render: 'text' },
      { prop: 'data.vendorName', label: '销方/购方', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.issueDate', label: '开票日', width: 110, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'createdAt', label: '登记时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '发票号/销方购方' },
      { field: 'invoiceType', label: '发票类型', type: 'select', options: INVOICE_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '发票详情',
      detailApiUrl: '/business/fin/invoice/detail',
      descriptionItems: invoiceDetailItems(),
      exportFilename: '发票台账',
    },
  })
}

export function buildFinInvoiceDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'invoice-detail',
    title: '发票详情',
    detailApiUrl: '/business/fin/invoice/detail',
    descriptionItems: invoiceDetailItems(),
    showApproval: false,
  })
}

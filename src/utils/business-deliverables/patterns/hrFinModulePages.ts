/**
 * HR 加班 · 财务报销/采购/付款 — L3 apply + list + detail
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

const COMPENSATION_OPTIONS = [
  { label: '调休', value: 'time_off' },
  { label: '加班费', value: 'pay' },
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

function overtimeDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '标题', field: 'title', type: 'text' },
    { label: '加班日期', field: 'overtimeDate', type: 'text' },
    { label: '开始时间', field: 'startTime', type: 'text' },
    { label: '结束时间', field: 'endTime', type: 'text' },
    { label: '时长(小时)', field: 'hours', type: 'text' },
    {
      label: '补偿方式',
      field: 'compensationType',
      type: 'tag',
      options: COMPENSATION_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '加班事由', field: 'reason', type: 'text', span: 2 },
  ]
}

const URGENCY_OPTIONS = [
  { label: '普通', value: 'normal' },
  { label: '紧急', value: 'urgent' },
  { label: '特急', value: 'critical' },
]

const PAYMENT_METHOD_OPTIONS = [
  { label: '银行转账', value: 'transfer' },
  { label: '支票', value: 'check' },
  { label: '现金', value: 'cash' },
]

function expenseDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '报销标题', field: 'title', type: 'text' },
    { label: '报销类型', field: 'expenseType', type: 'text' },
    { label: '合计金额', field: 'totalAmount', type: 'text', prefix: '¥' },
    { label: '明细行数', field: 'itemCount', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '明细摘要', field: 'itemsSummary', type: 'text', span: 2 },
  ]
}

function purchaseDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '采购标题', field: 'title', type: 'text' },
    { label: '预算总额', field: 'totalAmount', type: 'text', prefix: '¥' },
    { label: '供应商', field: 'supplier', type: 'text' },
    {
      label: '紧急程度',
      field: 'urgency',
      type: 'tag',
      options: URGENCY_OPTIONS.map((o) => ({ ...o, color: o.value === 'critical' ? 'danger' : o.value === 'urgent' ? 'warning' : 'info' })),
    },
    { label: '明细行数', field: 'itemCount', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '明细摘要', field: 'itemsSummary', type: 'text', span: 2 },
  ]
}

function paymentDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '标题', field: 'title', type: 'text' },
    { label: '关联单号', field: 'relatedDocNo', type: 'text' },
    { label: '收款方', field: 'payee', type: 'text' },
    { label: '付款金额', field: 'amount', type: 'text', prefix: '¥' },
    {
      label: '付款方式',
      field: 'paymentMethod',
      type: 'tag',
      options: PAYMENT_METHOD_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '收款账号', field: 'bankAccount', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

/** HR-05 加班申请 — P-02 */
export function buildHrOvertimeApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'hr-overtime',
    title: '加班申请',
    titleWidgetId: 'overtime-apply-title',
    applySchemaCode: 'hr-overtime-apply',
    listSchemaCode: 'hr-overtime-list',
    refs,
    boardHeight: 720,
    fields: [
      { field: 'title', label: '标题', props: { placeholder: '加班申请标题' }, validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'overtimeDate', label: '加班日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'startTime', label: '开始时间', props: { placeholder: '如 18:00' }, validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'endTime', label: '结束时间', props: { placeholder: '如 21:00' }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'hours', label: '加班时长(小时)', type: 'number', name: 'FgNumber', props: { min: 0.5, step: 0.5 }, validationRules: requiredRule('必填'), position: { x: 480, y: 240, w: 400, h: 40 } },
      {
        field: 'compensationType',
        label: '补偿方式',
        type: 'select',
        name: 'FgSelect',
        options: COMPENSATION_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 300, w: 400, h: 40 },
      },
      { field: 'reason', label: '加班事由', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 360, w: 832, h: 100 } },
    ],
  })
}

/** HR-05b 加班台账 */
export function buildHrOvertimeListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'hr-overtime-list',
    title: '加班台账',
    tableId: 'overtime-table',
    applySchemaCode: 'hr-overtime-apply',
    detailSchemaCode: 'hr-overtime-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.overtimeDate', label: '加班日期', width: 110, render: 'text' },
      { prop: 'data.hours', label: '时长', width: 80, align: 'center', render: 'text' },
      { prop: 'data.compensationType', label: '补偿', width: 90, render: 'tag', options: COMPENSATION_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/事由' },
      { field: 'compensationType', label: '补偿方式', type: 'select', options: COMPENSATION_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '加班详情',
      detailApiUrl: '/business/hr/overtime/detail',
      descriptionItems: overtimeDetailItems(),
      exportFilename: '加班台账',
    },
  })
}

export function buildHrOvertimeDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'overtime-detail',
    title: '加班详情',
    detailApiUrl: '/business/hr/overtime/detail',
    descriptionItems: overtimeDetailItems(),
  })
}

/** FI-02 报销台账 */
export function buildFinExpenseListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'fin-expense-list',
    title: '报销台账',
    tableId: 'expense-table',
    applySchemaCode: 'fin-expense-apply',
    detailSchemaCode: 'fin-expense-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.totalAmount', label: '金额', width: 100, align: 'right', render: 'text' },
      { prop: 'data.expenseType', label: '类型', width: 100, render: 'tag' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/标题' },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '报销详情',
      detailApiUrl: '/business/fin/expense/detail',
      descriptionItems: expenseDetailItems(),
      exportFilename: '报销台账',
    },
  })
}

export function buildFinExpenseDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'expense-detail',
    title: '报销详情',
    detailApiUrl: '/business/fin/expense/detail',
    descriptionItems: expenseDetailItems(),
  })
}

/** FI-04b 采购台账 */
export function buildFinPurchaseListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'fin-purchase-list',
    title: '采购台账',
    tableId: 'purchase-table',
    applySchemaCode: 'fin-purchase-apply',
    detailSchemaCode: 'fin-purchase-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.totalAmount', label: '预算', width: 100, align: 'right', render: 'text' },
      { prop: 'data.supplier', label: '供应商', minWidth: 120, render: 'text', showTooltip: true },
      { prop: 'data.urgency', label: '紧急', width: 90, render: 'tag', options: URGENCY_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/标题/供应商' },
      { field: 'urgency', label: '紧急程度', type: 'select', options: URGENCY_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '采购详情',
      detailApiUrl: '/business/fin/purchase/detail',
      descriptionItems: purchaseDetailItems(),
      exportFilename: '采购台账',
    },
  })
}

export function buildFinPurchaseDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'purchase-detail',
    title: '采购详情',
    detailApiUrl: '/business/fin/purchase/detail',
    descriptionItems: purchaseDetailItems(),
  })
}

/** FI-05 付款申请 — P-02 */
export function buildFinPaymentApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'fin-payment',
    title: '付款申请',
    titleWidgetId: 'payment-apply-title',
    applySchemaCode: 'fin-payment-apply',
    listSchemaCode: 'fin-payment-list',
    refs,
    boardHeight: 720,
    fields: [
      { field: 'title', label: '标题', props: { placeholder: '付款申请标题' }, validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'relatedDocNo', label: '关联合同/采购单号', props: { placeholder: '合同或采购单号' }, validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'payee', label: '收款方', validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'amount', label: '付款金额', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      {
        field: 'paymentMethod',
        label: '付款方式',
        type: 'select',
        name: 'FgSelect',
        options: PAYMENT_METHOD_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 240, w: 400, h: 40 },
      },
      { field: 'bankAccount', label: '收款账号', validationRules: requiredRule('必填'), position: { x: 48, y: 300, w: 832, h: 40 } },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 360, w: 832, h: 80 } },
    ],
  })
}

/** FI-05b 付款台账 */
export function buildFinPaymentListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'fin-payment-list',
    title: '付款台账',
    tableId: 'payment-table',
    applySchemaCode: 'fin-payment-apply',
    detailSchemaCode: 'fin-payment-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.payee', label: '收款方', minWidth: 120, render: 'text' },
      { prop: 'data.amount', label: '金额', width: 100, align: 'right', render: 'text' },
      { prop: 'data.paymentMethod', label: '方式', width: 100, render: 'tag', options: PAYMENT_METHOD_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/收款方' },
      { field: 'paymentMethod', label: '付款方式', type: 'select', options: PAYMENT_METHOD_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '付款详情',
      detailApiUrl: '/business/fin/payment/detail',
      descriptionItems: paymentDetailItems(),
      exportFilename: '付款台账',
    },
  })
}

export function buildFinPaymentDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'payment-detail',
    title: '付款详情',
    detailApiUrl: '/business/fin/payment/detail',
    descriptionItems: paymentDetailItems(),
  })
}

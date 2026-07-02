/**
 * HR-10 招聘需求 — L3 apply + list + detail
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

const URGENCY_OPTIONS = [
  { label: '普通', value: 'normal' },
  { label: '紧急', value: 'urgent' },
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

function recruitDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '岗位名称', field: 'title', type: 'text' },
    { label: '招聘人数', field: 'headcount', type: 'text' },
    {
      label: '紧急程度',
      field: 'urgency',
      type: 'tag',
      options: URGENCY_OPTIONS.map((o) => ({ ...o, color: o.value === 'urgent' ? 'warning' : 'info' })),
    },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '需求说明', field: 'reason', type: 'text', span: 2 },
  ]
}

/** HR-10 招聘需求 — P-02 */
export function buildHrRecruitApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'hr-recruit',
    title: '招聘需求',
    titleWidgetId: 'recruit-apply-title',
    applySchemaCode: 'hr-recruit-apply',
    listSchemaCode: 'hr-recruit-list',
    refs,
    boardHeight: 720,
    fields: [
      { field: 'title', label: '岗位名称', props: { placeholder: '招聘岗位' }, validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'headcount', label: '招聘人数', type: 'number', name: 'FgNumber', props: { min: 1 }, validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      {
        field: 'urgency',
        label: '紧急程度',
        type: 'select',
        name: 'FgSelect',
        options: URGENCY_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 180, w: 400, h: 40 },
      },
      { field: 'reason', label: '需求说明', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 832, h: 100 } },
    ],
  })
}

/** HR-10b 招聘台账 */
export function buildHrRecruitListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'hr-recruit-list',
    title: '招聘台账',
    tableId: 'recruit-table',
    applySchemaCode: 'hr-recruit-apply',
    detailSchemaCode: 'hr-recruit-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '岗位', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.headcount', label: '人数', width: 80, align: 'center', render: 'text' },
      { prop: 'data.urgency', label: '紧急', width: 90, render: 'tag', options: URGENCY_OPTIONS },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/岗位/申请人' },
      { field: 'urgency', label: '紧急程度', type: 'select', options: URGENCY_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '招聘需求详情',
      detailApiUrl: '/business/hr/recruit/detail',
      descriptionItems: recruitDetailItems(),
      exportFilename: '招聘台账',
    },
  })
}

export function buildHrRecruitDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'recruit-detail',
    title: '招聘需求详情',
    detailApiUrl: '/business/hr/recruit/detail',
    descriptionItems: recruitDetailItems(),
  })
}

/** HR-10c Offer 审批 — P-02 */
export function buildHrRecruitOfferPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'hr-recruit-offer',
    title: 'Offer 审批',
    titleWidgetId: 'recruit-offer-title',
    applySchemaCode: 'hr-recruit-offer',
    refs,
    boardHeight: 720,
    fields: [
      { field: 'title', label: '候选人', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'position', label: '录用岗位', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'salary', label: 'Offer 薪资', type: 'number', name: 'FgNumber', props: { min: 0 }, validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'onboardDate', label: '预计到岗日', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'reason', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 300, w: 832, h: 80 } },
    ],
  })
}

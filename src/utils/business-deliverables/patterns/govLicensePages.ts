/**
 * GA-05/06 证照申请 — L3 apply + list + detail
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

const LICENSE_TYPE_OPTIONS = [
  { label: '营业执照', value: 'business_license' },
  { label: '经营许可证', value: 'operating_permit' },
  { label: '资质证书', value: 'qualification' },
  { label: '其他证照', value: 'other' },
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

function licenseDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    {
      label: '证照类型',
      field: 'licenseType',
      type: 'tag',
      options: LICENSE_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '持有人', field: 'holderName', type: 'text' },
    { label: '用途', field: 'purpose', type: 'text', span: 2 },
    { label: '有效期至', field: 'validUntil', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

/** GA-05 证照申请 — P-02 */
export function buildGovLicenseApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'gov-license',
    title: '证照申请',
    titleWidgetId: 'gov-license-apply-title',
    applySchemaCode: 'gov-license-apply',
    listSchemaCode: 'gov-license-list',
    refs,
    boardHeight: 720,
    fields: [
      {
        field: 'licenseType',
        label: '证照类型',
        type: 'select',
        name: 'FgSelect',
        options: LICENSE_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 48, y: 120, w: 400, h: 40 },
      },
      { field: 'holderName', label: '持有人', validationRules: requiredRule('必填'), position: { x: 480, y: 120, w: 400, h: 40 } },
      { field: 'purpose', label: '用途', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 832, h: 40 } },
      { field: 'validUntil', label: '有效期至', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 300, w: 832, h: 80 } },
    ],
  })
}

/** GA-06 证照台账 */
export function buildGovLicenseListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'gov-license-list',
    title: '证照管理',
    tableId: 'gov-license-table',
    applySchemaCode: 'gov-license-apply',
    detailSchemaCode: 'gov-license-detail',
    refs,
    columns: [
      { prop: '_id', label: '申请号', minWidth: 120, render: 'link' },
      { prop: 'data.licenseType', label: '证照类型', width: 120, render: 'tag', options: LICENSE_TYPE_OPTIONS },
      { prop: 'data.holderName', label: '持有人', minWidth: 120, render: 'text' },
      { prop: 'data.purpose', label: '用途', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.validUntil', label: '有效期至', width: 110, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '申请号/持有人/用途' },
      { field: 'licenseType', label: '证照类型', type: 'select', options: LICENSE_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '证照详情',
      detailApiUrl: '/business/gov/license/detail',
      descriptionItems: licenseDetailItems(),
      exportFilename: '证照台账',
    },
  })
}

export function buildGovLicenseDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'gov-license',
    title: '证照详情',
    detailApiUrl: '/business/gov/license/detail',
    descriptionItems: licenseDetailItems(),
  })
}

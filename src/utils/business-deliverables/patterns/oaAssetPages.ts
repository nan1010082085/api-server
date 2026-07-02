/**
 * OA-12 资产领用 — L3 apply + list + detail
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

const ASSET_TYPE_OPTIONS = [
  { label: '办公设备', value: 'office' },
  { label: 'IT 设备', value: 'it' },
  { label: '家具', value: 'furniture' },
  { label: '其他', value: 'other' },
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

function assetDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '标题', field: 'title', type: 'text' },
    { label: '资产名称', field: 'assetName', type: 'text' },
    {
      label: '资产类型',
      field: 'assetType',
      type: 'tag',
      options: ASSET_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '数量', field: 'quantity', type: 'text' },
    { label: '领用日期', field: 'useDate', type: 'text' },
    { label: '预计归还', field: 'expectedReturnDate', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '领用事由', field: 'reason', type: 'text', span: 2 },
  ]
}

/** OA-12 资产领用 — P-02 */
export function buildOaAssetApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'oa-asset',
    title: '资产领用',
    titleWidgetId: 'asset-apply-title',
    applySchemaCode: 'oa-asset-apply',
    listSchemaCode: 'oa-asset-list',
    refs,
    boardHeight: 780,
    fields: [
      { field: 'title', label: '标题', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'assetName', label: '资产名称', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      {
        field: 'assetType',
        label: '资产类型',
        type: 'select',
        name: 'FgSelect',
        options: ASSET_TYPE_OPTIONS,
        validationRules: requiredRule('必填'),
        position: { x: 480, y: 180, w: 400, h: 40 },
      },
      { field: 'quantity', label: '数量', type: 'number', name: 'FgNumber', props: { min: 1 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'useDate', label: '领用日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 480, y: 240, w: 400, h: 40 } },
      { field: 'expectedReturnDate', label: '预计归还日期', type: 'date', name: 'FgDate', position: { x: 48, y: 300, w: 400, h: 40 } },
      { field: 'reason', label: '领用事由', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: requiredRule('必填'), position: { x: 48, y: 360, w: 832, h: 100 } },
    ],
  })
}

/** OA-12b 资产领用台账 */
export function buildOaAssetListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-asset-list',
    title: '资产领用台账',
    tableId: 'asset-table',
    applySchemaCode: 'oa-asset-apply',
    detailSchemaCode: 'oa-asset-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 120, render: 'text', showTooltip: true },
      { prop: 'data.assetName', label: '资产', minWidth: 120, render: 'text' },
      { prop: 'data.assetType', label: '类型', width: 100, render: 'tag', options: ASSET_TYPE_OPTIONS },
      { prop: 'data.quantity', label: '数量', width: 70, align: 'center', render: 'text' },
      { prop: 'data.useDate', label: '领用日', width: 110, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/资产/申请人' },
      { field: 'assetType', label: '资产类型', type: 'select', options: ASSET_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '资产领用详情',
      detailApiUrl: '/business/oa/asset/detail',
      descriptionItems: assetDetailItems(),
      exportFilename: '资产领用台账',
    },
  })
}

export function buildOaAssetDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'asset-detail',
    title: '资产领用详情',
    detailApiUrl: '/business/oa/asset/detail',
    descriptionItems: assetDetailItems(),
  })
}

/**
 * EQ-04 装备领用 — L3 apply + list + detail
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

function requisitionDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '装备名称', field: 'equipmentName', type: 'text' },
    { label: '领用人', field: 'borrowerName', type: 'text' },
    { label: '领用部门', field: 'department', type: 'text' },
    { label: '用途', field: 'purpose', type: 'text', span: 2 },
    { label: '预计归还', field: 'expectedReturnDate', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

export function buildEquipRequisitionApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'equip-requisition',
    title: '装备领用',
    titleWidgetId: 'equip-requisition-title',
    applySchemaCode: 'equip-requisition-apply',
    listSchemaCode: 'equip-requisition-list',
    refs,
    boardHeight: 780,
    fields: [
      { field: 'equipmentName', label: '装备名称', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'borrowerName', label: '领用人', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'department', label: '领用部门', validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'purpose', label: '用途', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 832, h: 80 } },
      { field: 'expectedReturnDate', label: '预计归还日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 48, y: 340, w: 400, h: 40 } },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 400, w: 832, h: 80 } },
    ],
  })
}

export function buildEquipRequisitionListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'equip-requisition-list',
    title: '领用台账',
    tableId: 'equip-requisition-table',
    applySchemaCode: 'equip-requisition-apply',
    detailSchemaCode: 'equip-requisition-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.equipmentName', label: '装备', minWidth: 140, render: 'text' },
      { prop: 'data.borrowerName', label: '领用人', minWidth: 100, render: 'text' },
      { prop: 'data.department', label: '部门', minWidth: 120, render: 'text' },
      { prop: 'data.expectedReturnDate', label: '预计归还', width: 110, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/装备/领用人' },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '领用详情',
      detailApiUrl: '/business/equip/requisition/detail',
      descriptionItems: requisitionDetailItems(),
      exportFilename: '装备领用台账',
    },
  })
}

export function buildEquipRequisitionDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'equip-requisition',
    title: '装备领用详情',
    detailApiUrl: '/business/equip/requisition/detail',
    descriptionItems: requisitionDetailItems(),
  })
}

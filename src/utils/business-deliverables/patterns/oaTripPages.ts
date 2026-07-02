/**
 * OA-06/07/07b 出差申请 · 台账 · 详情 — 按 modules/02-oa-collaboration 规格搭建
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildCrudSubmissionListPage } from './crudSubmissionListPage.js'
import { buildFlowSubmissionApplyPage, buildFlowSubmissionDetailPage } from './flowSubmissionPages.js'

export const TRIP_TRANSPORT_OPTIONS = [
  { label: '飞机', value: 'flight' },
  { label: '高铁', value: 'train' },
  { label: '汽车', value: 'car' },
  { label: '其他', value: 'other' },
]

export const TRIP_STATUS_OPTIONS = [
  { label: '审批中', value: 'submitted' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

export const TRIP_STATUS_COLOR_MAP: Record<string, string> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
}

function requiredRule(message: string) {
  return [{ required: true, message, trigger: 'blur' }]
}

function tripDetailDescriptionItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '标题', field: 'title', type: 'text' },
    { label: '目的地', field: 'destination', type: 'text' },
    { label: '开始日期', field: 'startDate', type: 'text' },
    { label: '结束日期', field: 'endDate', type: 'text' },
    {
      label: '交通工具',
      field: 'transport',
      type: 'tag',
      options: TRIP_TRANSPORT_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '预算金额', field: 'budgetAmount', type: 'text', suffix: '元' },
    { label: '部门', field: 'deptName', type: 'text' },
    {
      label: '状态',
      field: 'status',
      type: 'tag',
      options: [
        { label: '审批中', value: '审批中', color: 'warning' },
        { label: '已通过', value: '已通过', color: 'success' },
        { label: '已驳回', value: '已驳回', color: 'danger' },
      ],
    },
    { label: '同行人', field: 'companions', type: 'text' },
    { label: '附件', field: 'attachments', type: 'text' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '出差事由', field: 'reason', type: 'text', span: 2 },
  ]
}

/** OA-06 出差申请 — P-02 */
export function buildOaTripApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'oa-trip',
    title: '出差申请',
    titleWidgetId: 'trip-apply-title',
    applySchemaCode: 'oa-trip-apply',
    listSchemaCode: 'oa-trip-list',
    refs,
    boardHeight: 1200,
    confirmMessage: '确认提交出差申请？',
    fields: [
      {
        field: 'title',
        label: '出差标题',
        props: { placeholder: '请输入出差标题' },
        validationRules: requiredRule('请输入出差标题'),
        position: { x: 48, y: 120, w: 832, h: 40 },
      },
      {
        field: 'destination',
        label: '目的地',
        props: { placeholder: '城市或详细地址' },
        validationRules: requiredRule('请填写目的地'),
        position: { x: 48, y: 180, w: 400, h: 40 },
      },
      {
        field: 'region',
        label: '省市区',
        type: 'cascader',
        name: 'FgCascader',
        props: { placeholder: '可选', clearable: true },
        options: [
          {
            label: '北京市',
            value: 'beijing',
            children: [{ label: '北京市', value: 'beijing-city', children: [{ label: '朝阳区', value: 'chaoyang' }] }],
          },
          {
            label: '上海市',
            value: 'shanghai',
            children: [{ label: '上海市', value: 'shanghai-city', children: [{ label: '浦东新区', value: 'pudong' }] }],
          },
        ],
        position: { x: 480, y: 180, w: 400, h: 40 },
      },
      {
        field: 'startDate',
        label: '开始日期',
        type: 'date',
        name: 'FgDate',
        props: { placeholder: '开始日期', type: 'date', format: 'YYYY-MM-DD' },
        validationRules: requiredRule('请选择开始日期'),
        position: { x: 48, y: 240, w: 400, h: 40 },
      },
      {
        field: 'endDate',
        label: '结束日期',
        type: 'date',
        name: 'FgDate',
        props: { placeholder: '结束日期', type: 'date', format: 'YYYY-MM-DD' },
        validationRules: requiredRule('请选择结束日期'),
        position: { x: 480, y: 240, w: 400, h: 40 },
      },
      {
        field: 'transport',
        label: '交通工具',
        type: 'select',
        name: 'FgSelect',
        props: { placeholder: '请选择', clearable: true },
        options: TRIP_TRANSPORT_OPTIONS,
        validationRules: requiredRule('请选择交通工具'),
        position: { x: 48, y: 300, w: 400, h: 40 },
      },
      {
        field: 'budgetAmount',
        label: '预算金额',
        type: 'number',
        name: 'FgNumber',
        props: { placeholder: '元', min: 0, precision: 2 },
        validationRules: requiredRule('请填写预算金额'),
        position: { x: 480, y: 300, w: 400, h: 40 },
      },
      {
        field: 'companions',
        label: '同行人',
        type: 'user-selector',
        name: 'FgUserSelector',
        props: { placeholder: '可多选（可选）', multiple: true, clearable: true, filterable: true },
        position: { x: 48, y: 360, w: 832, h: 40 },
      },
      {
        field: 'reason',
        label: '出差事由',
        type: 'textarea',
        name: 'FgTextarea',
        props: { placeholder: '请填写出差事由', rows: 4, showWordLimit: true, maxlength: 500 },
        validationRules: requiredRule('请填写出差事由'),
        position: { x: 48, y: 420, w: 832, h: 100 },
      },
      {
        field: 'attachments',
        label: '附件',
        type: 'upload',
        name: 'FgUpload',
        props: { multiple: true, limit: 5, buttonText: '上传行程单/审批依据', listType: 'text' },
        position: { x: 48, y: 540, w: 832, h: 80 },
      },
    ],
  })
}

/** OA-07 出差台账 — P-01 */
export function buildOaTripListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-trip-list',
    title: '出差台账',
    tableId: 'trip-table',
    applySchemaCode: 'oa-trip-apply',
    detailSchemaCode: 'oa-trip-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link', linkEvent: 'open-detail' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.destination', label: '目的地', minWidth: 120, render: 'text' },
      { prop: 'data.startDate', label: '开始', width: 110, render: 'text' },
      { prop: 'data.endDate', label: '结束', width: 110, render: 'text' },
      {
        prop: 'data.transport',
        label: '交通',
        width: 90,
        render: 'tag',
        filterable: true,
        options: TRIP_TRANSPORT_OPTIONS,
      },
      { prop: 'data.budgetAmount', label: '预算', width: 100, align: 'right', render: 'text' },
      {
        prop: 'status',
        label: '状态',
        minWidth: 100,
        render: 'tag',
        filterable: true,
        colorMap: TRIP_STATUS_COLOR_MAP,
        options: TRIP_STATUS_OPTIONS,
      },
      { prop: 'flowStatus', label: '流程状态', minWidth: 110, render: 'flowStatus' },
      { prop: 'currentTaskName', label: '当前节点', minWidth: 120, render: 'text' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      {
        prop: 'action',
        label: '操作',
        width: 160,
        fixed: 'right',
        render: 'buttons',
        buttons: [
          { key: 'view', label: '查看', type: 'primary', size: 'small' },
          { key: 'approve', label: '审批', type: 'success', size: 'small' },
        ],
      },
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/标题/目的地' },
      { field: 'transport', label: '交通', type: 'select', options: TRIP_TRANSPORT_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: TRIP_STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date', placeholder: 'YYYY-MM-DD' },
      { field: 'dateTo', label: '结束日期', type: 'date', placeholder: 'YYYY-MM-DD' },
    ],
    dialog: {
      dialogTitle: '出差详情',
      detailApiUrl: '/business/oa/trip/detail',
      descriptionItems: tripDetailDescriptionItems(),
      exportFilename: '出差台账',
    },
  })
}

/** OA-07b 出差详情（全屏审批）— P-03 */
export function buildOaTripDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'trip-detail',
    title: '出差详情',
    detailApiUrl: '/business/oa/trip/detail',
    descriptionItems: tripDetailDescriptionItems(),
  })
}

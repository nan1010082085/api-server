/**
 * OA-05/06 会议预约 — L3 apply + list + detail
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildCrudSubmissionListPage } from './crudSubmissionListPage.js'
import { buildFlowSubmissionApplyPage, buildFlowSubmissionDetailPage } from './flowSubmissionPages.js'
import { makeBoard } from './pageBuilders.js'

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

function meetingDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '会议主题', field: 'title', type: 'text' },
    { label: '会议室', field: 'room', type: 'text' },
    { label: '会议日期', field: 'meetingDate', type: 'text' },
    { label: '开始时间', field: 'startTime', type: 'text' },
    { label: '结束时间', field: 'endTime', type: 'text' },
    { label: '参会人数', field: 'attendeeCount', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

/** OA-05 会议预约 — P-02 + Calendar */
export function buildOaMeetingBookPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const base = buildFlowSubmissionApplyPage({
    code: 'oa-meeting',
    title: '会议预约',
    titleWidgetId: 'meeting-book-title',
    applySchemaCode: 'oa-meeting-book',
    listSchemaCode: 'oa-meeting-list',
    refs,
    boardHeight: 780,
    fields: [
      { field: 'title', label: '会议主题', validationRules: requiredRule('必填'), position: { x: 48, y: 120, w: 832, h: 40 } },
      { field: 'room', label: '会议室', validationRules: requiredRule('必填'), position: { x: 48, y: 180, w: 400, h: 40 } },
      { field: 'meetingDate', label: '会议日期', type: 'date', name: 'FgDate', validationRules: requiredRule('必填'), position: { x: 480, y: 180, w: 400, h: 40 } },
      { field: 'startTime', label: '开始时间', props: { placeholder: '如 09:00' }, validationRules: requiredRule('必填'), position: { x: 48, y: 240, w: 400, h: 40 } },
      { field: 'endTime', label: '结束时间', props: { placeholder: '如 11:00' }, validationRules: requiredRule('必填'), position: { x: 480, y: 240, w: 400, h: 40 } },
      { field: 'attendeeCount', label: '参会人数', type: 'number', name: 'FgNumber', props: { min: 1 }, validationRules: requiredRule('必填'), position: { x: 48, y: 300, w: 400, h: 40 } },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, position: { x: 48, y: 360, w: 832, h: 80 } },
    ],
  })
  const widgets = base.widgets as Array<Record<string, unknown>>
  widgets.push({
    id: 'meeting-calendar',
    type: 'calendar',
    name: 'FgCalendar',
    label: '日程',
    position: { x: 48, y: 520, w: 832, h: 240, zIndex: 5 },
    props: { title: '会议室日程' },
    options: [],
    variables: [],
    events: [],
    rules: [],
    validationRules: [],
  })
  return { widgets, board: makeBoard(960, 820) }
}

/** OA-06 会议列表 */
export function buildOaMeetingListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-meeting-list',
    title: '会议列表',
    tableId: 'meeting-table',
    applySchemaCode: 'oa-meeting-book',
    detailSchemaCode: 'oa-meeting-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '主题', minWidth: 140, render: 'text', showTooltip: true },
      { prop: 'data.room', label: '会议室', width: 110, render: 'text' },
      { prop: 'data.meetingDate', label: '日期', width: 110, render: 'text' },
      { prop: 'data.startTime', label: '开始', width: 80, render: 'text' },
      { prop: 'data.endTime', label: '结束', width: 80, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS, colorMap: STATUS_COLOR_MAP },
      { prop: 'createdAt', label: '预约时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/主题/会议室' },
      { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
      { field: 'dateFrom', label: '开始日期', type: 'date' },
      { field: 'dateTo', label: '结束日期', type: 'date' },
    ],
    dialog: {
      dialogTitle: '会议详情',
      detailApiUrl: '/business/oa/meeting/detail',
      descriptionItems: meetingDetailItems(),
      exportFilename: '会议列表',
    },
  })
}

export function buildOaMeetingDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'meeting-detail',
    title: '会议详情',
    detailApiUrl: '/business/oa/meeting/detail',
    descriptionItems: meetingDetailItems(),
    showApproval: false,
  })
}

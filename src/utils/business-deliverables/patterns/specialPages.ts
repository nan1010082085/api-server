/**
 * Non-pattern deliverable pages (Phase C/D upgrades).
 */
import type { BusinessSchemaRefs } from '../types.js'
import { makeBoard, titleWidget, buildApplyFormPage } from './pageBuilders.js'

export function buildNoticeDetailPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('notice-detail-title', '公告详情'),
      {
        id: 'notice-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '公告内容',
        position: { x: 24, y: 72, w: 900, h: 400, zIndex: 2 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '公告信息',
          column: 1,
          border: true,
          dataSource: {
            url: '/notices/{{variables.recordId}}',
            method: 'get',
            dataPath: 'data',
          },
          items: [
            { field: 'title', label: '标题' },
            { field: 'content', label: '正文' },
            { field: 'status', label: '状态' },
            { field: 'publishAt', label: '发布时间' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 720, [
      { name: 'recordId', type: 'string', defaultValue: '' },
    ]),
  }
}

export function buildNoticePublishPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '公告发布',
    submitSchemaCode: 'oa-notice-publish',
    refs,
    fields: [
      { field: 'title', label: '标题', type: 'input', props: { placeholder: '公告标题' }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'noticeType', label: '类型', type: 'select', name: 'FgSelect', props: { placeholder: '请选择类型' }, api: { dictCode: 'notice_type' }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'content', label: '正文', type: 'richtext', name: 'FgRichtext', props: { placeholder: '公告正文' }, validationRules: [{ required: true, message: '必填' }] },
    ],
  })
}

export function buildFinExpenseApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const schema = refs.schemas['fin-expense-apply']
  const formId = 'form_main'
  return {
    widgets: [
      titleWidget('expense-title', '费用报销'),
      {
        id: 'form_main',
        type: 'form',
        name: 'FgForm',
        label: '表单',
        position: { x: 24, y: 72, w: 912, h: 720, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '24px' },
        props: { labelWidth: '120px' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
        children: [],
      },
      {
        id: 'field-title',
        type: 'input',
        name: 'FgInput',
        label: '报销标题',
        field: 'title',
        formId,
        position: { x: 48, y: 120, w: 680, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '报销标题' },
        validationRules: [{ required: true, message: '必填' }],
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'field-expenseType',
        type: 'select',
        name: 'FgSelect',
        label: '报销类型',
        field: 'expenseType',
        formId,
        position: { x: 48, y: 176, w: 400, h: 40, zIndex: 3 },
        api: { dictCode: 'expense_type' },
        props: { placeholder: '请选择' },
        validationRules: [{ required: true, message: '必填' }],
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'expense-items',
        type: 'dynamic-detail-table',
        name: 'FgDynamicDetailTable',
        label: '费用明细',
        field: 'items',
        formId,
        position: { x: 48, y: 232, w: 840, h: 280, zIndex: 3 },
        props: {
          title: '费用明细',
          field: 'items',
          columns: [
            { prop: 'name', label: '项目', type: 'input' },
            { prop: 'amount', label: '金额', type: 'number' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'field-totalAmount',
        type: 'number',
        name: 'FgNumber',
        label: '合计金额',
        field: 'totalAmount',
        formId,
        position: { x: 48, y: 528, w: 300, h: 40, zIndex: 3 },
        props: { min: 0, precision: 2, disabled: true },
        validationRules: [{ required: false }],
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'btn-submit',
        type: 'button',
        name: 'FgButton',
        label: '提交',
        position: { x: 48, y: 588, w: 120, h: 40, zIndex: 99 },
        props: { text: '提交报销', type: 'primary' },
        events: [{
          trigger: 'click',
          actions: [{ type: 'submitSubmission', schemaId: schema?.formSchemaId, validateFormId: formId }],
        }],
        options: [],
        variables: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 720),
  }
}

export function buildMeetingBookPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const base = buildApplyFormPage({
    title: '会议预约',
    submitSchemaCode: 'oa-meeting-book',
    refs,
    fields: [
      { field: 'title', label: '会议主题', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'room', label: '会议室', type: 'input', validationRules: [{ required: true, message: '必填' }] },
    ],
  })
  const widgets = base.widgets as Array<Record<string, unknown>>
  widgets.push({
    id: 'meeting-calendar',
    type: 'calendar',
    name: 'FgCalendar',
    label: '日程',
    position: { x: 24, y: 320, w: 480, h: 360, zIndex: 5 },
    props: { title: '会议室日程' },
    options: [],
    variables: [],
    events: [],
    rules: [],
    validationRules: [],
  })
  return { widgets, board: makeBoard(960, 720) }
}

function adminTablePage(title: string, apiUrl: string, columns: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('admin-title', title),
      {
        id: 'admin-table',
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        props: {
          columns,
          stripe: true,
          border: true,
          height: 680,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
        },
        api: { url: apiUrl, method: 'get', dataPath: 'items', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }
}

export function buildSysDictManagePage(): Record<string, unknown> {
  return adminTablePage('字典管理', '/dict/types', [
    { prop: 'code', label: '编码', minWidth: 140, render: 'text' },
    { prop: 'name', label: '名称', minWidth: 160, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysAuditLogPage(): Record<string, unknown> {
  return adminTablePage('操作审计', '/audit-logs', [
    { prop: 'username', label: '用户', minWidth: 120, render: 'text' },
    { prop: 'module', label: '模块', minWidth: 120, render: 'text' },
    { prop: 'action', label: '操作', minWidth: 100, render: 'text' },
    { prop: 'status', label: '结果', minWidth: 80, render: 'tag' },
    { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysConfigManagePage(): Record<string, unknown> {
  return adminTablePage('系统参数', '/config', [
    { prop: 'key', label: '参数键', minWidth: 180, render: 'text' },
    { prop: 'value', label: '参数值', minWidth: 200, render: 'text' },
    { prop: 'description', label: '说明', minWidth: 200, render: 'text' },
  ])
}

export function buildAuditIssueListPage(): Record<string, unknown> {
  return adminTablePage('审计问题', '/audit/issues', [
    { prop: 'title', label: '问题标题', minWidth: 200, render: 'link', linkEvent: 'open-detail' },
    { prop: 'severity', label: '严重程度', minWidth: 100, render: 'tag', filterable: true },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  ])
}

export function buildAuditIssueDetailPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const detailPublishId = refs.schemas['audit-issue-detail']?.publishId ?? ''
  return {
    widgets: [
      titleWidget('audit-issue-title', '审计问题整改'),
      {
        id: 'issue-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '问题详情',
        position: { x: 24, y: 72, w: 900, h: 240, zIndex: 2 },
        props: {
          title: '问题信息',
          column: 2,
          border: true,
          dataSource: { url: '/audit/issues/{{variables.recordId}}', method: 'get', dataPath: 'data' },
          items: [
            { field: 'title', label: '问题标题' },
            { field: 'severity', label: '严重程度' },
            { field: 'status', label: '状态' },
            { field: 'description', label: '说明' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'compliance-checklist',
        type: 'compliance-checklist',
        name: 'FgComplianceChecklist',
        label: '合规检查',
        position: { x: 24, y: 328, w: 600, h: 200, zIndex: 3 },
        props: {
          title: '整改检查项',
          items: [
            { key: 'evidence', label: '整改证据已上传' },
            { key: 'review', label: '复核通过' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'flow-timeline',
        type: 'flow-timeline',
        name: 'FgFlowTimeline',
        label: '审批记录',
        position: { x: 24, y: 544, w: 900, h: 280, zIndex: 4 },
        props: { title: '整改流程', instanceIdVariable: 'flowInstanceId' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 900, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
      { name: 'detailPublishId', type: 'string', defaultValue: detailPublishId },
    ]),
  }
}

export function buildGovCaseDetailPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('gov-case-title', '政务事项详情'),
      {
        id: 'case-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '事项信息',
        position: { x: 24, y: 72, w: 900, h: 280, zIndex: 2 },
        props: {
          title: '受理信息',
          column: 2,
          border: true,
          dataSource: { url: '/business/hr/leave/detail?recordId={{variables.recordId}}', method: 'get', dataPath: 'data' },
          items: [
            { field: 'title', label: '事项标题' },
            { field: 'status', label: '状态' },
            { field: 'flowStatus', label: '流程状态' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'gov-timeline',
        type: 'flow-timeline',
        name: 'FgFlowTimeline',
        label: '并联审批进度',
        position: { x: 24, y: 368, w: 900, h: 320, zIndex: 3 },
        props: { title: '审批进度', instanceIdVariable: 'flowInstanceId' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 800, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
    ]),
  }
}

export function buildReportDocDetailPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('report-doc-title', '报告详情'),
      {
        id: 'report-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '报告信息',
        position: { x: 24, y: 72, w: 900, h: 280, zIndex: 2 },
        props: {
          title: '报告变量',
          column: 2,
          border: true,
          dataSource: { url: '/business/hr/leave/detail?recordId={{variables.recordId}}', method: 'get', dataPath: 'data' },
          items: [
            { field: 'title', label: '报告标题' },
            { field: 'status', label: '状态' },
            { field: 'reportPeriod', label: '报告期', defaultValue: '{{variables.reportPeriod}}' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'btn-export',
        type: 'button',
        name: 'FgButton',
        label: '导出',
        position: { x: 24, y: 368, w: 120, h: 40, zIndex: 3 },
        props: { text: '导出 PDF', type: 'primary' },
        events: [{
          trigger: 'click',
          actions: [{
            type: 'api',
            apiUrl: '/submissions/{{variables.recordId}}/export?format=pdf',
            apiMethod: 'get',
          }],
        }],
        options: [],
        variables: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 720, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'reportPeriod', type: 'string', defaultValue: '' },
    ]),
  }
}

export function buildFinStatsComboPage(title: string, statLabel: string, tableApi: string): Record<string, unknown> {
  return {
    widgets: [
      titleWidget(`fin-${title}-title`, title),
      {
        id: 'fin-stat',
        type: 'statistic',
        name: 'FgStatistic',
        label: statLabel,
        position: { x: 24, y: 72, w: 280, h: 120, zIndex: 2 },
        props: { title: statLabel, value: 0, suffix: '项', apiUrl: '/dashboard', responseDataPath: 'kpis.pendingApprovals' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'fin-table',
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: title,
        position: { x: 24, y: 210, w: 1392, h: 640, zIndex: 3 },
        props: {
          columns: [
            { prop: 'title', label: '名称', minWidth: 160, render: 'text' },
            { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
            { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
          ],
          stripe: true,
          border: true,
          height: 560,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
        },
        api: { url: tableApi, method: 'get', dataPath: 'items', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }
}

export function buildFinReconcilePage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('fin-reconcile-title', '银行对账'),
      {
        id: 'reconcile-stat',
        type: 'statistic',
        name: 'FgStatistic',
        label: '待对账',
        position: { x: 24, y: 72, w: 280, h: 120, zIndex: 2 },
        props: { title: '待对账', value: 0, suffix: '笔', apiUrl: '/dashboard', responseDataPath: 'kpis.pendingApprovals' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'reconcile-table',
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: '对账明细',
        position: { x: 24, y: 210, w: 1392, h: 640, zIndex: 3 },
        props: {
          columns: [
            { prop: 'username', label: '操作人', minWidth: 120, render: 'text' },
            { prop: 'module', label: '模块', minWidth: 120, render: 'text' },
            { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
          ],
          stripe: true,
          border: true,
          height: 560,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
        },
        api: { url: '/audit-logs', method: 'get', dataPath: 'items', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }
}

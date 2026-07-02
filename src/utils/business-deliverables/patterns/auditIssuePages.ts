/**
 * AU-06/07 审计问题 — 域 API 台账 + 整改详情
 */
import type { BusinessSchemaRefs } from '../types.js'
import { makeBoard, titleWidget } from './pageBuilders.js'

const SEVERITY_OPTIONS = [
  { label: '低', value: 'low', color: 'info' },
  { label: '中', value: 'medium', color: 'warning' },
  { label: '高', value: 'high', color: 'danger' },
]

const STATUS_OPTIONS = [
  { label: '待整改', value: 'open', color: 'warning' },
  { label: '整改中', value: 'in_progress', color: 'primary' },
  { label: '已关闭', value: 'closed', color: 'success' },
]

function issueListTable(title: string, tableId: string) {
  return {
    widgets: [
      titleWidget(`${tableId}-title`, title),
      {
        id: tableId,
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        props: {
          columns: [
            { prop: '_id', label: '问题编号', minWidth: 120, render: 'link', linkEvent: 'open-detail' },
            { prop: 'title', label: '问题标题', minWidth: 200, render: 'text', showTooltip: true },
            { prop: 'severity', label: '严重程度', width: 100, render: 'tag', filterable: true, options: SEVERITY_OPTIONS },
            { prop: 'status', label: '状态', width: 100, render: 'tag', filterable: true, options: STATUS_OPTIONS },
            { prop: 'description', label: '说明', minWidth: 180, render: 'text', showTooltip: true },
            { prop: 'createdAt', label: '发现时间', minWidth: 160, render: 'text' },
            {
              prop: 'action',
              label: '操作',
              width: 120,
              fixed: 'right',
              render: 'buttons',
              buttons: [{ key: 'view', label: '查看', type: 'primary', size: 'small' }],
            },
          ],
          stripe: true,
          border: true,
          height: 680,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
          searchBar: {
            fields: [
              { field: 'keyword', label: '关键词', type: 'input', placeholder: '标题/说明' },
              { field: 'severity', label: '严重程度', type: 'select', options: SEVERITY_OPTIONS },
              { field: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
            ],
          },
          detailSchemaCode: 'audit-issue-detail',
        },
        api: { url: '/audit/issues', method: 'get', dataPath: 'items', immediate: true },
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

/** AU-06 审计问题台账 */
export function buildAuditIssueListPage(): Record<string, unknown> {
  return issueListTable('审计问题', 'audit-issue-table')
}

/** AU-08 整改跟踪台账 */
export function buildAuditRectifyTrackPage(): Record<string, unknown> {
  return issueListTable('整改跟踪', 'audit-rectify-table')
}

/** AU-07 问题详情/整改 */
export function buildAuditIssueDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('audit-issue-title', '审计问题整改'),
      {
        id: 'issue-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '问题详情',
        position: { x: 24, y: 72, w: 1392, h: 280, zIndex: 2 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '问题信息',
          column: 2,
          border: true,
          dataSource: {
            type: 'api',
            url: '/business/audit/issue/detail?recordId={{variables.recordId}}',
          },
          items: [
            { label: '问题标题', field: 'title', type: 'text' },
            { label: '严重程度', field: 'severity', type: 'tag', options: SEVERITY_OPTIONS },
            { label: '状态', field: 'status', type: 'tag', options: STATUS_OPTIONS },
            { label: '说明', field: 'description', type: 'text', span: 2 },
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
        position: { x: 24, y: 368, w: 680, h: 220, zIndex: 3 },
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
        position: { x: 24, y: 608, w: 1392, h: 280, zIndex: 4 },
        props: { title: '整改流程', instanceIdVariable: 'flowInstanceId' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 960, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
    ]),
  }
}

/**
 * Phase 2–4 extended business schema deliverables (pattern-based).
 */
import type { BusinessSchemaRefs } from '../types.js'
import {
  buildApplyFormPage,
  buildPlaceholderPage,
  buildStatsDashboardPage,
  buildSubmissionListPage,
  makeBoard,
  titleWidget,
} from '../patterns/pageBuilders.js'
import {
  buildAuditIssueDetailPage,
  buildAuditIssueListPage,
  buildFinExpenseApplyPage,
  buildFinReconcilePage,
  buildFinStatsComboPage,
  buildGovCaseDetailPage,
  buildMeetingBookPage,
  buildNoticeDetailPage,
  buildNoticePublishPage,
  buildReportDocDetailPage,
  buildSysAuditLogPage,
  buildSysConfigManagePage,
  buildSysDictManagePage,
} from '../patterns/specialPages.js'

const DEFAULT_LIST_COLUMNS = [
  { prop: '_id', label: '单号', minWidth: 120, render: 'link', linkEvent: 'open-detail' },
  { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
  { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true },
  { prop: 'flowStatus', label: '流程', minWidth: 100, render: 'flowStatus' },
  { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  {
    prop: 'action',
    label: '操作',
    width: 120,
    fixed: 'right',
    render: 'buttons',
    buttons: [{ key: 'view', label: '查看', type: 'primary', size: 'small' }],
  },
]

const DEFAULT_FORM_FIELDS = [
  { field: 'title', label: '标题', type: 'input', props: { placeholder: '请输入标题' }, validationRules: [{ required: true, message: '必填' }] },
  { field: 'reason', label: '说明', type: 'textarea', props: { rows: 3 }, validationRules: [{ required: true, message: '必填' }] },
]

type Builder = (refs: BusinessSchemaRefs) => Record<string, unknown>

function list(code: string, title: string, apply: string, detail?: string): Builder {
  return (refs) => buildSubmissionListPage({
    code,
    title,
    applyCode: apply,
    detailCode: detail,
    columns: DEFAULT_LIST_COLUMNS,
    refs,
  })
}

function apply(code: string, title: string, selfCode: string): Builder {
  return (refs) => buildApplyFormPage({
    title,
    submitSchemaCode: selfCode,
    fields: DEFAULT_FORM_FIELDS,
    refs,
  })
}

function stats(title: string, api: string): Builder {
  return () => buildStatsDashboardPage(title, api)
}

function placeholder(title: string, note: string): Builder {
  return () => buildPlaceholderPage(title, note)
}

/** Extended deliverable codes (Phase 2–4) */
export const EXTENDED_DELIVERABLE_CODES = [
  // OA
  'oa-notice-list', 'oa-notice-publish', 'oa-notice-detail',
  'oa-trip-apply', 'oa-trip-list',
  'oa-meeting-list', 'oa-meeting-book', 'oa-seal-apply',
  'oa-doc-receive', 'oa-doc-draft', 'oa-asset-apply', 'oa-knowledge-entry',
  // HR extended
  'hr-overtime-apply', 'hr-overtime-list',
  'hr-onboard-apply', 'hr-onboard-list',
  'hr-resign-apply', 'hr-resign-list',
  'hr-employee-profile', 'hr-org-chart', 'hr-attendance-dashboard', 'hr-contract-list',
  // Finance
  'fin-expense-apply', 'fin-expense-list', 'fin-expense-stats',
  'fin-purchase-apply', 'fin-purchase-list',
  'fin-contract-list', 'fin-contract-detail',
  'fin-budget-edit', 'fin-budget-dashboard',
  'fin-payment-apply', 'fin-payment-list',
  'fin-invoice-list', 'fin-invoice-register',
  'fin-bank-reconcile', 'fin-monthly-close', 'fin-ledger-balance', 'fin-cash-plan',
  // System extended
  'sys-menu-manage', 'sys-dict-manage', 'sys-config-manage',
  'sys-audit-log', 'sys-login-log', 'sys-post-manage', 'sys-online-users', 'sys-tenant-manage',
  // Audit
  'audit-plan-list', 'audit-project-list', 'audit-issue-list', 'audit-issue-detail', 'audit-report-list',
  // Metrology
  'metrology-device-list', 'metrology-device-register', 'metrology-calibration-plan', 'metrology-alert-dashboard',
  'equipment-asset-list', 'equipment-borrow-apply', 'equipment-inventory-list',
  // Government
  'gov-case-apply', 'gov-case-list', 'gov-case-detail', 'gov-license-list', 'gov-supervision-list',
  // Reports
  'report-dashboard-general', 'report-center-home', 'report-export-center', 'report-exec-screen',
  'report-doc-list', 'report-doc-edit', 'report-doc-detail', 'report-doc-templates',
] as const

export type ExtendedDeliverableCode = (typeof EXTENDED_DELIVERABLE_CODES)[number]

const EXTENDED_BUILDERS: Record<ExtendedDeliverableCode, Builder> = {
  'oa-notice-list': list('oa-notice-list', '公告列表', 'oa-notice-publish', 'oa-notice-detail'),
  'oa-notice-publish': (refs) => buildNoticePublishPage(refs),
  'oa-notice-detail': () => buildNoticeDetailPage(),
  'oa-trip-apply': apply('oa-trip-apply', '出差申请', 'oa-trip-apply'),
  'oa-trip-list': list('oa-trip-list', '出差台账', 'oa-trip-apply'),
  'oa-meeting-list': list('oa-meeting-list', '会议列表', 'oa-meeting-book'),
  'oa-meeting-book': (refs) => buildMeetingBookPage(refs),
  'oa-seal-apply': apply('oa-seal-apply', '用印申请', 'oa-seal-apply'),
  'oa-doc-receive': apply('oa-doc-receive', '公文收文', 'oa-doc-receive'),
  'oa-doc-draft': apply('oa-doc-draft', '公文拟稿', 'oa-doc-draft'),
  'oa-asset-apply': apply('oa-asset-apply', '资产领用', 'oa-asset-apply'),
  'oa-knowledge-entry': placeholder('知识库入口', '跳转 AI 知识库 /app/ai/rag'),

  'hr-overtime-apply': apply('hr-overtime-apply', '加班申请', 'hr-overtime-apply'),
  'hr-overtime-list': list('hr-overtime-list', '加班台账', 'hr-overtime-apply'),
  'hr-onboard-apply': apply('hr-onboard-apply', '入职办理', 'hr-onboard-apply'),
  'hr-onboard-list': list('hr-onboard-list', '入职台账', 'hr-onboard-apply'),
  'hr-resign-apply': apply('hr-resign-apply', '离职办理', 'hr-resign-apply'),
  'hr-resign-list': list('hr-resign-list', '离职台账', 'hr-resign-apply'),
  'hr-employee-profile': placeholder('员工档案', '员工档案列表：AdvancedTable + 详情 descriptions'),
  'hr-org-chart': placeholder('组织架构', '组织架构树：TreeLayout + dept API'),
  'hr-attendance-dashboard': stats('考勤统计', '/dashboard'),
  'hr-contract-list': list('hr-contract-list', '合同台账', 'hr-onboard-apply'),

  'fin-expense-apply': (refs) => buildFinExpenseApplyPage(refs),
  'fin-expense-list': list('fin-expense-list', '报销台账', 'fin-expense-apply'),
  'fin-expense-stats': stats('报销统计', '/business/hr/leave/stats'),
  'fin-purchase-apply': apply('fin-purchase-apply', '采购申请', 'fin-purchase-apply'),
  'fin-purchase-list': list('fin-purchase-list', '采购台账', 'fin-purchase-apply'),
  'fin-contract-list': list('fin-contract-list', '合同台账', 'fin-contract-detail'),
  'fin-contract-detail': placeholder('合同详情', '合同详情 descriptions + 附件'),
  'fin-budget-edit': apply('fin-budget-edit', '预算编制', 'fin-budget-edit'),
  'fin-budget-dashboard': stats('预算执行', '/dashboard'),
  'fin-payment-apply': apply('fin-payment-apply', '付款申请', 'fin-payment-apply'),
  'fin-payment-list': list('fin-payment-list', '付款台账', 'fin-payment-apply'),
  'fin-invoice-list': list('fin-invoice-list', '发票台账', 'fin-invoice-register'),
  'fin-invoice-register': apply('fin-invoice-register', '发票登记', 'fin-invoice-register'),
  'fin-bank-reconcile': () => buildFinReconcilePage(),
  'fin-monthly-close': () => buildFinStatsComboPage('财务月结', '待月结', '/submissions'),
  'fin-ledger-balance': () => buildFinStatsComboPage('科目余额', '科目数', '/submissions'),
  'fin-cash-plan': apply('fin-cash-plan', '资金计划', 'fin-cash-plan'),

  'sys-menu-manage': placeholder('菜单管理', '菜单 CRUD：对接 /api/menus'),
  'sys-dict-manage': () => buildSysDictManagePage(),
  'sys-config-manage': () => buildSysConfigManagePage(),
  'sys-audit-log': () => buildSysAuditLogPage(),
  'sys-login-log': placeholder('登录日志', '登录日志 AdvancedTable'),
  'sys-post-manage': placeholder('岗位管理', '岗位 AdvancedTable /api/posts'),
  'sys-online-users': placeholder('在线用户', '在线会话列表'),
  'sys-tenant-manage': placeholder('租户管理', '租户 AdvancedTable'),

  'audit-plan-list': list('audit-plan-list', '审计计划', 'audit-project-list'),
  'audit-project-list': list('audit-project-list', '审计项目', 'audit-issue-list'),
  'audit-issue-list': () => buildAuditIssueListPage(),
  'audit-issue-detail': (refs) => buildAuditIssueDetailPage(refs),
  'audit-report-list': list('audit-report-list', '审计报告', 'audit-report-list'),

  'metrology-device-list': () => ({
    widgets: [
      titleWidget('metrology-device-list-title', '器具台账'),
      {
        id: 'metrology-table',
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: '器具台账',
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        props: {
          columns: [
            { prop: 'code', label: '编号', minWidth: 120, render: 'text' },
            { prop: 'name', label: '名称', minWidth: 160, render: 'text' },
            { prop: 'calibrationDueAt', label: '到期日', minWidth: 140, render: 'text' },
            { prop: 'expiryStatus', label: '预警', minWidth: 100, render: 'expiryAlert' },
            { prop: 'location', label: '位置', minWidth: 120, render: 'text' },
          ],
          stripe: true,
          border: true,
          height: 680,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
        },
        api: { url: '/metrology/devices', method: 'get', dataPath: 'items', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }),
  'metrology-device-register': apply('metrology-device-register', '器具登记', 'metrology-device-register'),
  'metrology-calibration-plan': apply('metrology-calibration-plan', '检定计划', 'metrology-calibration-plan'),
  'metrology-alert-dashboard': stats('到期预警', '/dashboard'),
  'equipment-asset-list': list('equipment-asset-list', '装备台账', 'equipment-borrow-apply'),
  'equipment-borrow-apply': apply('equipment-borrow-apply', '装备领用', 'equipment-borrow-apply'),
  'equipment-inventory-list': placeholder('装备盘点', 'Phase 4 盘点全流程'),

  'gov-case-apply': apply('gov-case-apply', '事项受理', 'gov-case-apply'),
  'gov-case-list': list('gov-case-list', '事项台账', 'gov-case-apply', 'gov-case-detail'),
  'gov-case-detail': () => buildGovCaseDetailPage(),
  'gov-license-list': list('gov-license-list', '证照管理', 'gov-case-apply'),
  'gov-supervision-list': list('gov-supervision-list', '督查督办', 'gov-case-apply'),

  'report-dashboard-general': stats('综合统计', '/dashboard'),
  'report-center-home': placeholder('报表中心', '报表目录 + 快捷入口'),
  'report-export-center': placeholder('导出中心', 'E-21 批量导出 Action'),
  'report-exec-screen': placeholder('领导驾驶舱', 'E-09 大屏布局'),
  'report-doc-list': list('report-doc-list', '报告台账', 'report-doc-edit', 'report-doc-detail'),
  'report-doc-edit': apply('report-doc-edit', '报告编制', 'report-doc-edit'),
  'report-doc-detail': () => buildReportDocDetailPage(),
  'report-doc-templates': placeholder('报告模板', '模板库 AdvancedTable'),
}

export function isExtendedDeliverableCode(code: string): code is ExtendedDeliverableCode {
  return (EXTENDED_DELIVERABLE_CODES as readonly string[]).includes(code)
}

export function buildExtendedDeliverableSchemaJson(
  code: ExtendedDeliverableCode,
  refs: BusinessSchemaRefs,
): Record<string, unknown> {
  return EXTENDED_BUILDERS[code](refs)
}

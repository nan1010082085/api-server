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
  buildAuditIssueListPage,
  buildAuditIssueDetailPage,
  buildAuditRectifyTrackPage,
} from '../patterns/auditIssuePages.js'
import {
  buildFinExpenseApplyPage,
  buildFinReconcilePage,
  buildFinStatsComboPage,
  buildNoticeDetailPage,
  buildNoticeListPage,
  buildNoticePublishPage,
  buildReportDocDetailPage,
  buildSysAuditLogPage,
  buildSysConfigManagePage,
  buildSysDictManagePage,
  buildHrOrgChartPage,
  buildSysMenuManagePage,
  buildSysLoginLogPage,
  buildSysPostManagePage,
  buildSysTenantManagePage,
  buildHrEmployeeProfilePage,
  buildReportExecScreenPage,
  buildReportCenterHomePage,
  buildReportExportCenterPage,
  buildReportDocTemplatesPage,
  buildSysOnlineUsersPage,
  buildFinContractDetailPage,
  buildOaKnowledgeEntryPage,
  buildGovSupervisionKanbanPage,
  buildFinPurchaseApplyPage,
  buildFinPaymentApplyPage,
  buildFinCashPlanPage,
  buildMetrologyDeviceRegisterPage,
  buildMetrologyCalibrationPlanPage,
  buildEquipmentBorrowApplyPage,
  buildReportDocEditPage,
  buildReportAdhocQueryPage,
  buildWorkbenchMessagesPage,
  buildSysMicroAppManagePage,
  buildMetrologyDeviceDetailPage,
} from '../patterns/specialPages.js'
import {
  buildOaTripApplyPage,
  buildOaTripDetailPage,
  buildOaTripListPage,
} from '../patterns/oaTripPages.js'
import {
  buildOaSealApplyPage,
  buildOaSealListPage,
  buildOaSealDetailPage,
  buildOaDocReceivePage,
  buildOaDocReceiveListPage,
  buildOaDocReceiveDetailPage,
  buildOaDocDraftPage,
  buildOaDocDraftListPage,
  buildOaDocDraftDetailPage,
} from '../patterns/oaSealDocPages.js'
import {
  buildHrOvertimeApplyPage,
  buildHrOvertimeListPage,
  buildHrOvertimeDetailPage,
  buildFinExpenseListPage,
  buildFinExpenseDetailPage,
  buildFinPurchaseListPage,
  buildFinPurchaseDetailPage,
  buildFinPaymentListPage,
  buildFinPaymentDetailPage,
} from '../patterns/hrFinModulePages.js'
import {
  buildFinInvoiceRegisterPage,
  buildFinInvoiceListPage,
  buildFinInvoiceDetailPage,
} from '../patterns/finInvoicePages.js'
import {
  buildFinBudgetEditPage,
  buildFinBudgetListPage,
  buildFinBudgetDetailPage,
} from '../patterns/finBudgetPages.js'
import {
  buildEquipRequisitionApplyPage,
  buildEquipRequisitionListPage,
  buildEquipRequisitionDetailPage,
} from '../patterns/equipRequisitionPages.js'
import {
  buildHrOnboardApplyPage,
  buildHrOnboardListPage,
  buildHrOnboardDetailPage,
} from '../patterns/hrOnboardPages.js'
import {
  buildGovCaseApplyPage,
  buildGovCaseListPage,
  buildGovCaseDetailPage,
} from '../patterns/govCasePages.js'
import {
  buildGovLicenseApplyPage,
  buildGovLicenseListPage,
  buildGovLicenseDetailPage,
} from '../patterns/govLicensePages.js'
import {
  buildHrResignApplyPage,
  buildHrResignListPage,
  buildHrResignDetailPage,
} from '../patterns/hrResignPages.js'
import {
  buildOaMeetingBookPage,
  buildOaMeetingListPage,
  buildOaMeetingDetailPage,
} from '../patterns/oaMeetingPages.js'
import {
  buildOaAssetApplyPage,
  buildOaAssetListPage,
  buildOaAssetDetailPage,
} from '../patterns/oaAssetPages.js'
import {
  buildHrRecruitApplyPage,
  buildHrRecruitListPage,
  buildHrRecruitDetailPage,
  buildHrRecruitOfferPage,
} from '../patterns/hrRecruitPages.js'

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

function list(code: string, title: string, apply: string, detail?: string, searchBar?: Array<Record<string, unknown>>): Builder {
  return (refs) => buildSubmissionListPage({
    code,
    title,
    applyCode: apply,
    detailCode: detail,
    columns: DEFAULT_LIST_COLUMNS,
    refs,
    searchBar,
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

function reportSummary(title: string, statLabel: string, tableApi: string, statApi?: string, statPath = 'total'): Builder {
  return () => buildFinStatsComboPage(title, statLabel, tableApi, {
    statApi: statApi ?? tableApi,
    statDataPath: statPath,
    columns: DEFAULT_LIST_COLUMNS,
  })
}

function placeholder(title: string, note: string): Builder {
  return () => buildPlaceholderPage(title, note)
}

/** Extended deliverable codes (Phase 2–4) */
export const EXTENDED_DELIVERABLE_CODES = [
  // OA
  'oa-notice-list', 'oa-notice-publish', 'oa-notice-detail',
  'oa-trip-apply', 'oa-trip-list', 'oa-trip-detail',
  'oa-meeting-list', 'oa-meeting-book', 'oa-meeting-detail',
  'oa-seal-apply', 'oa-seal-list', 'oa-seal-detail',
  'oa-doc-receive', 'oa-doc-receive-list', 'oa-doc-receive-detail',
  'oa-doc-draft', 'oa-doc-draft-list', 'oa-doc-draft-detail',
  'oa-asset-apply', 'oa-asset-list', 'oa-asset-detail', 'oa-knowledge-entry',
  // HR extended
  'hr-overtime-apply', 'hr-overtime-list', 'hr-overtime-detail',
  'hr-onboard-apply', 'hr-onboard-list', 'hr-onboard-detail',
  'hr-resign-apply', 'hr-resign-list', 'hr-resign-detail',
  'hr-employee-profile', 'hr-org-chart', 'hr-attendance-dashboard', 'hr-contract-list',
  'hr-recruit-apply', 'hr-recruit-list', 'hr-recruit-detail', 'hr-recruit-offer',
  // Finance
  'fin-expense-apply', 'fin-expense-list', 'fin-expense-detail', 'fin-expense-stats',
  'fin-purchase-apply', 'fin-purchase-list', 'fin-purchase-detail',
  'fin-contract-list', 'fin-contract-detail',
  'fin-budget-edit', 'fin-budget-list', 'fin-budget-detail', 'fin-budget-dashboard',
  'fin-payment-apply', 'fin-payment-list', 'fin-payment-detail',
  'fin-invoice-list', 'fin-invoice-register', 'fin-invoice-detail',
  'fin-bank-reconcile', 'fin-monthly-close', 'fin-ledger-balance', 'fin-cash-plan',
  // System extended
  'sys-menu-manage', 'sys-dict-manage', 'sys-config-manage',
  'sys-audit-log', 'sys-login-log', 'sys-post-manage', 'sys-online-users', 'sys-tenant-manage',
  // Audit
  'audit-plan-list', 'audit-project-list', 'audit-issue-list', 'audit-issue-detail', 'audit-report-list',
  'audit-plan-edit', 'audit-project-detail', 'audit-working-paper', 'audit-rectify-track',
  'audit-compliance-check', 'audit-compliance-form', 'audit-report-edit', 'audit-stats-dashboard', 'audit-sys-log',
  // Metrology
  'metrology-device-list', 'metrology-device-register', 'metrology-calibration-plan', 'metrology-alert-dashboard',
  'metrology-device-detail', 'metrology-calibration-record', 'metrology-calibration-apply', 'metrology-cert-list',
  'metrology-expiry-dashboard', 'metrology-stats',
  'equipment-asset-list', 'equipment-borrow-apply', 'equipment-inventory-list',
  'equip-asset-list', 'equip-asset-register', 'equip-asset-detail', 'equip-requisition-apply', 'equip-requisition-list', 'equip-requisition-detail',
  'equip-return-register', 'equip-inventory-task', 'equip-inventory-form', 'equip-scrap-apply', 'equip-stats-dashboard',
  // Government
  'gov-case-apply', 'gov-case-list', 'gov-case-detail', 'gov-license-list', 'gov-license-detail', 'gov-supervision-list',
  'gov-case-accept', 'gov-parallel-board', 'gov-license-apply', 'gov-policy-publish', 'gov-supervise-list', 'gov-dashboard-screen',
  // Reports
  'report-dashboard-general', 'report-center-home', 'report-export-center', 'report-exec-screen',
  'report-doc-list', 'report-doc-edit', 'report-doc-detail', 'report-doc-templates',
  'report-hr-summary', 'report-fin-summary', 'report-flow-efficiency', 'report-oa-summary', 'report-audit-summary',
  'report-metrology-summary', 'report-adhoc-query', 'report-subscription',
  'report-doc-schedule', 'report-doc-annual', 'report-doc-analysis', 'report-doc-preview',
  // Workbench
  'workbench-messages',
  // System L-26
  'sys-micro-app-manage',
] as const

export type ExtendedDeliverableCode = (typeof EXTENDED_DELIVERABLE_CODES)[number]

const EXTENDED_BUILDERS: Record<ExtendedDeliverableCode, Builder> = {
  'oa-notice-list': (refs) => buildNoticeListPage(refs),
  'oa-notice-publish': (refs) => buildNoticePublishPage(refs),
  'oa-notice-detail': () => buildNoticeDetailPage(),
  'oa-trip-apply': (refs) => buildOaTripApplyPage(refs),
  'oa-trip-list': (refs) => buildOaTripListPage(refs),
  'oa-trip-detail': (refs) => buildOaTripDetailPage(refs),
  'oa-meeting-list': (refs) => buildOaMeetingListPage(refs),
  'oa-meeting-book': (refs) => buildOaMeetingBookPage(refs),
  'oa-meeting-detail': (refs) => buildOaMeetingDetailPage(refs),
  'oa-seal-apply': (refs) => buildOaSealApplyPage(refs),
  'oa-seal-list': (refs) => buildOaSealListPage(refs),
  'oa-seal-detail': (refs) => buildOaSealDetailPage(refs),
  'oa-doc-receive': (refs) => buildOaDocReceivePage(refs),
  'oa-doc-receive-list': (refs) => buildOaDocReceiveListPage(refs),
  'oa-doc-receive-detail': (refs) => buildOaDocReceiveDetailPage(refs),
  'oa-doc-draft': (refs) => buildOaDocDraftPage(refs),
  'oa-doc-draft-list': (refs) => buildOaDocDraftListPage(refs),
  'oa-doc-draft-detail': (refs) => buildOaDocDraftDetailPage(refs),
  'oa-asset-apply': (refs) => buildOaAssetApplyPage(refs),
  'oa-asset-list': (refs) => buildOaAssetListPage(refs),
  'oa-asset-detail': (refs) => buildOaAssetDetailPage(refs),
  'oa-knowledge-entry': () => buildOaKnowledgeEntryPage(),

  'hr-overtime-apply': (refs) => buildHrOvertimeApplyPage(refs),
  'hr-overtime-list': (refs) => buildHrOvertimeListPage(refs),
  'hr-overtime-detail': (refs) => buildHrOvertimeDetailPage(refs),
  'hr-onboard-apply': (refs) => buildHrOnboardApplyPage(refs),
  'hr-onboard-list': (refs) => buildHrOnboardListPage(refs),
  'hr-onboard-detail': (refs) => buildHrOnboardDetailPage(refs),
  'hr-resign-apply': (refs) => buildHrResignApplyPage(refs),
  'hr-resign-list': (refs) => buildHrResignListPage(refs),
  'hr-resign-detail': (refs) => buildHrResignDetailPage(refs),
  'hr-employee-profile': () => buildHrEmployeeProfilePage(),
  'hr-org-chart': () => buildHrOrgChartPage(),
  'hr-attendance-dashboard': stats('考勤统计', '/dashboard'),
  'hr-contract-list': list('hr-contract-list', '合同台账', 'hr-onboard-apply'),

  'hr-recruit-apply': (refs) => buildHrRecruitApplyPage(refs),
  'hr-recruit-list': (refs) => buildHrRecruitListPage(refs),
  'hr-recruit-detail': (refs) => buildHrRecruitDetailPage(refs),
  'hr-recruit-offer': (refs) => buildHrRecruitOfferPage(refs),

  'fin-expense-apply': (refs) => buildFinExpenseApplyPage(refs),
  'fin-expense-list': (refs) => buildFinExpenseListPage(refs),
  'fin-expense-detail': (refs) => buildFinExpenseDetailPage(refs),
  'fin-expense-stats': stats('报销统计', '/business/hr/leave/stats'),
  'fin-purchase-apply': (refs) => buildFinPurchaseApplyPage(refs),
  'fin-purchase-list': (refs) => buildFinPurchaseListPage(refs),
  'fin-purchase-detail': (refs) => buildFinPurchaseDetailPage(refs),
  'fin-contract-list': list('fin-contract-list', '合同台账', 'fin-contract-detail'),
  'fin-contract-detail': () => buildFinContractDetailPage(),
  'fin-budget-edit': (refs) => buildFinBudgetEditPage(refs),
  'fin-budget-list': (refs) => buildFinBudgetListPage(refs),
  'fin-budget-detail': (refs) => buildFinBudgetDetailPage(refs),
  'fin-budget-dashboard': stats('预算执行', '/dashboard'),
  'fin-payment-apply': (refs) => buildFinPaymentApplyPage(refs),
  'fin-payment-list': (refs) => buildFinPaymentListPage(refs),
  'fin-payment-detail': (refs) => buildFinPaymentDetailPage(refs),
  'fin-invoice-list': (refs) => buildFinInvoiceListPage(refs),
  'fin-invoice-register': (refs) => buildFinInvoiceRegisterPage(refs),
  'fin-invoice-detail': (refs) => buildFinInvoiceDetailPage(refs),
  'fin-bank-reconcile': () => buildFinReconcilePage(),
  'fin-monthly-close': () => buildFinStatsComboPage('财务月结', '待月结', '/business/finance/monthly-close', {
    statApi: '/business/finance/monthly-close',
    statDataPath: 'total',
    columns: [
      { prop: 'title', label: '单据', minWidth: 160, render: 'text' },
      { prop: 'module', label: '模块', minWidth: 100, render: 'text' },
      { prop: 'amount', label: '金额', minWidth: 120, render: 'text' },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
      { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
    ],
  }),
  'fin-ledger-balance': () => buildFinStatsComboPage('科目余额', '科目数', '/business/finance/ledger-balance', {
    statApi: '/business/finance/ledger-balance',
    statDataPath: 'total',
    columns: [
      { prop: 'subject', label: '科目', minWidth: 160, render: 'text' },
      { prop: 'budgetAmount', label: '预算额', minWidth: 120, render: 'text' },
      { prop: 'actualAmount', label: '发生额', minWidth: 120, render: 'text' },
      { prop: 'balance', label: '余额', minWidth: 120, render: 'text' },
    ],
  }),
  'fin-cash-plan': (refs) => buildFinCashPlanPage(refs),

  'sys-menu-manage': () => buildSysMenuManagePage(),
  'sys-dict-manage': () => buildSysDictManagePage(),
  'sys-config-manage': () => buildSysConfigManagePage(),
  'sys-audit-log': () => buildSysAuditLogPage(),
  'sys-login-log': () => buildSysLoginLogPage(),
  'sys-post-manage': () => buildSysPostManagePage(),
  'sys-online-users': () => buildSysOnlineUsersPage(),
  'sys-tenant-manage': () => buildSysTenantManagePage(),

  'audit-plan-list': list('audit-plan-list', '审计计划', 'audit-project-list'),
  'audit-project-list': list('audit-project-list', '审计项目', 'audit-issue-list'),
  'audit-issue-list': () => buildAuditIssueListPage(),
  'audit-issue-detail': (refs) => buildAuditIssueDetailPage(refs),
  'audit-report-list': list('audit-report-list', '审计报告', 'audit-report-list'),
  'audit-plan-edit': (refs) => apply('audit-plan-edit', '计划编制', 'audit-plan-edit')(refs),
  'audit-project-detail': (refs) => buildAuditIssueDetailPage(refs),
  'audit-working-paper': (refs) => apply('audit-working-paper', '工作底稿', 'audit-working-paper')(refs),
  'audit-rectify-track': () => buildAuditRectifyTrackPage(),
  'audit-compliance-check': list('audit-compliance-check', '合规检查', 'audit-compliance-form'),
  'audit-compliance-form': (refs) => apply('audit-compliance-form', '合规检查表', 'audit-compliance-form')(refs),
  'audit-report-edit': (refs) => apply('audit-report-edit', '报告编制', 'audit-report-edit')(refs),
  'audit-stats-dashboard': stats('审计统计', '/dashboard'),
  'audit-sys-log': () => buildSysAuditLogPage(),

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
  'metrology-device-register': (refs) => buildMetrologyDeviceRegisterPage(refs),
  'metrology-calibration-plan': (refs) => buildMetrologyCalibrationPlanPage(refs),
  'metrology-alert-dashboard': stats('到期预警', '/dashboard'),
  'metrology-device-detail': () => buildMetrologyDeviceDetailPage(),
  'metrology-calibration-record': list('metrology-calibration-record', '检定记录', 'metrology-calibration-apply'),
  'metrology-calibration-apply': (refs) => apply('metrology-calibration-apply', '检定申请', 'metrology-calibration-apply')(refs),
  'metrology-cert-list': list('metrology-cert-list', '证书管理', 'metrology-device-register'),
  'metrology-expiry-dashboard': stats('到期预警', '/dashboard'),
  'metrology-stats': stats('计量统计', '/dashboard'),
  'equipment-asset-list': list('equipment-asset-list', '装备台账', 'equipment-borrow-apply'),
  'equipment-borrow-apply': (refs) => buildEquipmentBorrowApplyPage(refs),
  'equipment-inventory-list': list('equipment-inventory-list', '装备盘点', 'equipment-borrow-apply'),
  'equip-asset-list': list('equip-asset-list', '装备台账', 'equip-requisition-apply'),
  'equip-asset-register': (refs) => apply('equip-asset-register', '装备登记', 'equip-asset-register')(refs),
  'equip-asset-detail': () => buildMetrologyDeviceDetailPage(),
  'equip-requisition-apply': (refs) => buildEquipRequisitionApplyPage(refs),
  'equip-requisition-list': (refs) => buildEquipRequisitionListPage(refs),
  'equip-requisition-detail': (refs) => buildEquipRequisitionDetailPage(refs),
  'equip-return-register': (refs) => apply('equip-return-register', '归还登记', 'equip-return-register')(refs),
  'equip-inventory-task': list('equip-inventory-task', '盘点任务', 'equip-inventory-form'),
  'equip-inventory-form': (refs) => apply('equip-inventory-form', '盘点录入', 'equip-inventory-form')(refs),
  'equip-scrap-apply': (refs) => apply('equip-scrap-apply', '报废申请', 'equip-scrap-apply')(refs),
  'equip-stats-dashboard': stats('装备统计', '/dashboard'),

  'gov-case-apply': (refs) => buildGovCaseApplyPage(refs),
  'gov-case-list': (refs) => buildGovCaseListPage(refs),
  'gov-case-detail': (refs) => buildGovCaseDetailPage(refs),
  'gov-license-list': (refs) => buildGovLicenseListPage(refs),
  'gov-license-detail': (refs) => buildGovLicenseDetailPage(refs),
  'gov-supervision-list': () => buildGovSupervisionKanbanPage(),
  'gov-case-accept': (refs) => buildGovCaseApplyPage(refs),
  'gov-parallel-board': () => buildGovSupervisionKanbanPage(),
  'gov-license-apply': (refs) => buildGovLicenseApplyPage(refs),
  'gov-policy-publish': (refs) => apply('gov-policy-publish', '政策发布', 'gov-policy-publish')(refs),
  'gov-supervise-list': () => buildGovSupervisionKanbanPage(),
  'gov-dashboard-screen': () => buildReportExecScreenPage(),

  'report-dashboard-general': stats('综合统计', '/business/reports/aggregate'),
  'report-center-home': () => buildReportCenterHomePage(),
  'report-export-center': (refs) => buildReportExportCenterPage(refs),
  'report-exec-screen': () => buildReportExecScreenPage(),
  'report-doc-list': list('report-doc-list', '报告台账', 'report-doc-edit', 'report-doc-detail'),
  'report-doc-edit': (refs) => buildReportDocEditPage(refs),
  'report-doc-detail': () => buildReportDocDetailPage(),
  'report-doc-templates': () => buildReportDocTemplatesPage(),
  'report-hr-summary': reportSummary('人事报表', '请假总数', '/submissions', '/business/hr/leave/stats', 'total'),
  'report-fin-summary': reportSummary('财务报表', '待月结', '/submissions', '/business/finance/monthly-close', 'total'),
  'report-flow-efficiency': stats('流程效率', '/dashboard'),
  'report-oa-summary': reportSummary('OA 运营报表', '申请总数', '/submissions', '/dashboard', 'totalSubmissions'),
  'report-audit-summary': list('report-audit-summary', '审计报表', 'audit-report-edit'),
  'report-metrology-summary': stats('计装报表', '/dashboard'),
  'report-adhoc-query': () => buildReportAdhocQueryPage({ schemas: {}, leaveFlowDefinitionId: null }),
  'report-subscription': (refs) => apply('report-subscription', '报表订阅', 'report-subscription')(refs),
  'report-doc-schedule': list('report-doc-schedule', '定期报告任务', 'report-doc-edit'),
  'report-doc-annual': (refs) => apply('report-doc-annual', '年度报告', 'report-doc-annual')(refs),
  'report-doc-analysis': (refs) => apply('report-doc-analysis', '专题分析', 'report-doc-analysis')(refs),
  'report-doc-preview': () => buildReportDocDetailPage(),

  'workbench-messages': () => buildWorkbenchMessagesPage(),
  'sys-micro-app-manage': () => buildSysMicroAppManagePage(),
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

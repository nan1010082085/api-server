/**
 * Phase 2–4 extended menu tree (directories + representative schema routes).
 */
import type { MenuSeed } from './seedMenusTypes.js'

export const EXTENDED_MENUS: MenuSeed[] = [
  // OA
  { parentId: null, name: 'OA办公', path: '', icon: 'office-building', type: 'menu', permission: '', sort: 12, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__OA__', name: '公告列表', path: '/app/editor/view', icon: 'bell', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-notice-list' },
  { parentId: '__OA__', name: '公告发布', path: '/app/editor/view', icon: 'edit-pen', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-notice-publish' },
  { parentId: '__OA__', name: '出差申请', path: '/app/editor/view', icon: 'position', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-trip-apply' },
  { parentId: '__OA__', name: '出差台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-trip-list' },
  { parentId: '__OA__', name: '会议预约', path: '/app/editor/view', icon: 'calendar', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-meeting-book' },
  { parentId: '__OA__', name: '用印申请', path: '/app/editor/view', icon: 'stamp', type: 'menu', permission: '', sort: 6, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-seal-apply' },
  { parentId: '__OA__', name: '用印台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 7, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-seal-list' },
  { parentId: '__OA__', name: '会议列表', path: '/app/editor/view', icon: 'calendar', type: 'menu', permission: '', sort: 7, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-meeting-list' },
  { parentId: '__OA__', name: '资产领用', path: '/app/editor/view', icon: 'box', type: 'menu', permission: '', sort: 8, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-asset-apply' },
  { parentId: '__OA__', name: '知识库', path: '/app/ai/rag', icon: 'reading', type: 'menu', permission: '', sort: 9, microAppId: 'ai', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'micro-app' },

  // HR extended
  { parentId: '__HR__', name: '加班申请', path: '/app/editor/view', icon: 'timer', type: 'menu', permission: '', sort: 10, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-overtime-apply' },
  { parentId: '__HR__', name: '入职办理', path: '/app/editor/view', icon: 'user', type: 'menu', permission: '', sort: 11, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-onboard-apply' },
  { parentId: '__HR__', name: '员工档案', path: '/app/editor/view', icon: 'folder', type: 'menu', permission: '', sort: 12, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-employee-profile' },
  { parentId: '__HR__', name: '考勤统计', path: '/app/editor/view', icon: 'data-line', type: 'menu', permission: '', sort: 13, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-attendance-dashboard' },
  { parentId: '__HR__', name: '招聘需求', path: '/app/editor/view', icon: 'user-filled', type: 'menu', permission: '', sort: 15, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-recruit-apply' },
  { parentId: '__HR__', name: '招聘台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 16, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-recruit-list' },
  { parentId: '__HR__', name: 'Offer 审批', path: '/app/editor/view', icon: 'postcard', type: 'menu', permission: '', sort: 17, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-recruit-offer' },

  // Finance
  { parentId: null, name: '财务管理', path: '', icon: 'wallet', type: 'menu', permission: '', sort: 16, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__FINANCE__', name: '费用报销', path: '/app/editor/view', icon: 'money', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-expense-apply' },
  { parentId: '__FINANCE__', name: '报销台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-expense-list' },
  { parentId: '__FINANCE__', name: '采购申请', path: '/app/editor/view', icon: 'shopping-cart', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-purchase-apply' },
  { parentId: '__FINANCE__', name: '付款申请', path: '/app/editor/view', icon: 'credit-card', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-payment-apply' },
  { parentId: '__FINANCE__', name: '预算执行', path: '/app/editor/view', icon: 'pie-chart', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-budget-dashboard' },
  { parentId: '__FINANCE__', name: '银行对账', path: '/app/editor/view', icon: 'coin', type: 'menu', permission: '', sort: 6, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-bank-reconcile' },

  // System extended
  { parentId: '__SYSTEM__', name: '字典管理', path: '/app/editor/view', icon: 'collection', type: 'menu', permission: '', sort: 10, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-dict-manage' },
  { parentId: '__SYSTEM__', name: '系统参数', path: '/app/editor/view', icon: 'tools', type: 'menu', permission: '', sort: 11, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-config-manage' },
  { parentId: '__SYSTEM__', name: '操作审计', path: '/app/editor/view', icon: 'view', type: 'menu', permission: '', sort: 12, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-audit-log' },
  { parentId: '__SYSTEM__', name: '租户管理', path: '/app/editor/view', icon: 'office-building', type: 'menu', permission: '', sort: 13, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-tenant-manage' },

  // Audit
  { parentId: null, name: '审计监督', path: '', icon: 'document-checked', type: 'menu', permission: '', sort: 18, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__AUDIT__', name: '审计计划', path: '/app/editor/view', icon: 'calendar', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-plan-list' },
  { parentId: '__AUDIT__', name: '审计问题', path: '/app/editor/view', icon: 'warning', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-issue-list' },
  { parentId: '__AUDIT__', name: '审计报告', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-report-list' },
  { parentId: '__AUDIT__', name: '计划编制', path: '/app/editor/view', icon: 'edit-pen', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-plan-edit' },
  { parentId: '__AUDIT__', name: '整改跟踪', path: '/app/editor/view', icon: 'refresh', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-rectify-track' },
  { parentId: '__AUDIT__', name: '操作日志', path: '/app/editor/view', icon: 'view', type: 'menu', permission: '', sort: 6, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'audit-sys-log' },

  // Metrology
  { parentId: null, name: '计装管理', path: '', icon: 'odometer', type: 'menu', permission: '', sort: 19, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__METROLOGY__', name: '器具台账', path: '/app/editor/view', icon: 'box', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'metrology-device-list' },
  { parentId: '__METROLOGY__', name: '到期预警', path: '/app/editor/view', icon: 'alarm-clock', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'metrology-alert-dashboard' },
  { parentId: '__METROLOGY__', name: '装备领用', path: '/app/editor/view', icon: 'takeaway-box', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'equipment-borrow-apply' },
  { parentId: '__METROLOGY__', name: '检定申请', path: '/app/editor/view', icon: 'document-checked', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'metrology-calibration-apply' },
  { parentId: '__METROLOGY__', name: '证书管理', path: '/app/editor/view', icon: 'postcard', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'metrology-cert-list' },

  // Government
  { parentId: null, name: '政务审批', path: '', icon: 'coordinate', type: 'menu', permission: '', sort: 20, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__GOV__', name: '事项受理', path: '/app/editor/view', icon: 'edit', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'gov-case-apply' },
  { parentId: '__GOV__', name: '事项台账', path: '/app/editor/view', icon: 'list', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'gov-case-list' },
  { parentId: '__GOV__', name: '证照管理', path: '/app/editor/view', icon: 'postcard', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'gov-license-list' },
  { parentId: '__GOV__', name: '证照申请', path: '/app/editor/view', icon: 'edit', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'gov-license-apply' },
  { parentId: '__GOV__', name: '政策发布', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'gov-policy-publish' },

  // Reports
  { parentId: null, name: '报表中心', path: '', icon: 'data-analysis', type: 'menu', permission: '', sort: 21, microAppId: null, app: 'shell', layout: 'with-menu' },
  { parentId: '__REPORTS__', name: '综合统计', path: '/app/editor/view', icon: 'histogram', type: 'menu', permission: '', sort: 1, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-dashboard-general' },
  { parentId: '__REPORTS__', name: '领导驾驶舱', path: '/app/editor/view', icon: 'monitor', type: 'menu', permission: '', sort: 2, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-exec-screen' },
  { parentId: '__REPORTS__', name: '报告编制', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 3, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-doc-edit' },
  { parentId: '__OA__', name: '公文收文', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 10, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-doc-receive' },
  { parentId: '__OA__', name: '收文台账', path: '/app/editor/view', icon: 'document', type: 'menu', permission: '', sort: 11, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-doc-receive-list' },
  { parentId: '__OA__', name: '公文拟稿', path: '/app/editor/view', icon: 'edit-pen', type: 'menu', permission: '', sort: 12, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-doc-draft' },
  { parentId: '__OA__', name: '拟稿台账', path: '/app/editor/view', icon: 'edit-pen', type: 'menu', permission: '', sort: 13, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'oa-doc-draft-list' },
  { parentId: '__HR__', name: '加班台账', path: '/app/editor/view', icon: 'timer', type: 'menu', permission: '', sort: 14, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'hr-overtime-list' },
  { parentId: '__FINANCE__', name: '报销统计', path: '/app/editor/view', icon: 'data-line', type: 'menu', permission: '', sort: 7, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'fin-expense-stats' },
  { parentId: '__SYSTEM__', name: '字典管理', path: '/app/editor/view', icon: 'collection', type: 'menu', permission: '', sort: 6, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-dict-manage' },
  { parentId: '__REPORTS__', name: '报告台账', path: '/app/editor/view', icon: 'files', type: 'menu', permission: '', sort: 4, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-doc-list' },
  { parentId: '__REPORTS__', name: '人事报表', path: '/app/editor/view', icon: 'user', type: 'menu', permission: '', sort: 5, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-hr-summary' },
  { parentId: '__REPORTS__', name: '财务报表', path: '/app/editor/view', icon: 'wallet', type: 'menu', permission: '', sort: 6, microAppId: 'editor', target: '_self', app: 'shell', layout: 'with-menu', routeType: 'schema', schemaCode: 'report-fin-summary' },
  { parentId: '__SYSTEM__', name: '微应用 Schema', path: '/app/editor/view', icon: 'monitor', type: 'menu', permission: '', sort: 14, microAppId: 'editor', target: '_self', app: 'admin', layout: 'with-menu', routeType: 'schema', schemaCode: 'sys-micro-app-manage' },
]

export const EXTENDED_PARENT_PLACEHOLDERS: Record<string, string> = {
  __OA__: 'OA办公',
  __FINANCE__: '财务管理',
  __AUDIT__: '审计监督',
  __METROLOGY__: '计装管理',
  __GOV__: '政务审批',
  __REPORTS__: '报表中心',
}

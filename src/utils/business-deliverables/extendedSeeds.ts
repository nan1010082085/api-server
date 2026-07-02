/**
 * Extended schema seed metadata (Phase 2–4).
 */
import { EXTENDED_DELIVERABLE_CODES } from './modules/extended.js'
import type { BusinessSchemaSeedSpec } from './types.js'

const EXTENDED_META: Record<string, { name: string; type: BusinessSchemaSeedSpec['type'] }> = {
  'oa-notice-list': { name: '公告列表', type: 'search_list' },
  'oa-notice-publish': { name: '公告发布', type: 'form' },
  'oa-notice-detail': { name: '公告详情', type: 'layout' },
  'oa-trip-apply': { name: '出差申请', type: 'form' },
  'oa-trip-list': { name: '出差台账', type: 'search_list' },
  'oa-meeting-list': { name: '会议列表', type: 'search_list' },
  'oa-meeting-book': { name: '会议预约', type: 'form' },
  'oa-seal-apply': { name: '用印申请', type: 'form' },
  'oa-doc-receive': { name: '公文收文', type: 'form' },
  'oa-doc-draft': { name: '公文拟稿', type: 'form' },
  'oa-asset-apply': { name: '资产领用', type: 'form' },
  'oa-knowledge-entry': { name: '知识库入口', type: 'business' },
  'hr-overtime-apply': { name: '加班申请', type: 'form' },
  'hr-overtime-list': { name: '加班台账', type: 'search_list' },
  'hr-onboard-apply': { name: '入职办理', type: 'form' },
  'hr-onboard-list': { name: '入职台账', type: 'search_list' },
  'hr-resign-apply': { name: '离职办理', type: 'form' },
  'hr-resign-list': { name: '离职台账', type: 'search_list' },
  'hr-employee-profile': { name: '员工档案', type: 'business' },
  'hr-org-chart': { name: '组织架构', type: 'business' },
  'hr-attendance-dashboard': { name: '考勤统计', type: 'chart' },
  'hr-contract-list': { name: '合同台账', type: 'search_list' },
  'fin-expense-apply': { name: '费用报销', type: 'form' },
  'fin-expense-list': { name: '报销台账', type: 'search_list' },
  'fin-expense-stats': { name: '报销统计', type: 'chart' },
  'fin-purchase-apply': { name: '采购申请', type: 'form' },
  'fin-purchase-list': { name: '采购台账', type: 'search_list' },
  'fin-contract-list': { name: '合同台账', type: 'search_list' },
  'fin-contract-detail': { name: '合同详情', type: 'layout' },
  'fin-budget-edit': { name: '预算编制', type: 'form' },
  'fin-budget-dashboard': { name: '预算执行', type: 'chart' },
  'fin-payment-apply': { name: '付款申请', type: 'form' },
  'fin-payment-list': { name: '付款台账', type: 'search_list' },
  'fin-invoice-list': { name: '发票台账', type: 'search_list' },
  'fin-invoice-register': { name: '发票登记', type: 'form' },
  'fin-bank-reconcile': { name: '银行对账', type: 'business' },
  'fin-monthly-close': { name: '财务月结', type: 'report' },
  'fin-ledger-balance': { name: '科目余额', type: 'report' },
  'fin-cash-plan': { name: '资金计划', type: 'form' },
  'sys-menu-manage': { name: '菜单管理', type: 'business' },
  'sys-dict-manage': { name: '字典管理', type: 'business' },
  'sys-config-manage': { name: '系统参数', type: 'business' },
  'sys-audit-log': { name: '操作审计', type: 'table' },
  'sys-login-log': { name: '登录日志', type: 'table' },
  'sys-post-manage': { name: '岗位管理', type: 'business' },
  'sys-online-users': { name: '在线用户', type: 'table' },
  'sys-tenant-manage': { name: '租户管理', type: 'business' },
  'audit-plan-list': { name: '审计计划', type: 'search_list' },
  'audit-project-list': { name: '审计项目', type: 'search_list' },
  'audit-issue-list': { name: '审计问题', type: 'search_list' },
  'audit-issue-detail': { name: '问题整改', type: 'layout' },
  'audit-report-list': { name: '审计报告', type: 'search_list' },
  'metrology-device-list': { name: '器具台账', type: 'search_list' },
  'metrology-device-register': { name: '器具登记', type: 'form' },
  'metrology-calibration-plan': { name: '检定计划', type: 'form' },
  'metrology-alert-dashboard': { name: '到期预警', type: 'chart' },
  'equipment-asset-list': { name: '装备台账', type: 'search_list' },
  'equipment-borrow-apply': { name: '装备领用', type: 'form' },
  'equipment-inventory-list': { name: '装备盘点', type: 'search_list' },
  'gov-case-apply': { name: '事项受理', type: 'form' },
  'gov-case-list': { name: '事项台账', type: 'search_list' },
  'gov-case-detail': { name: '事项详情', type: 'layout' },
  'gov-license-list': { name: '证照管理', type: 'search_list' },
  'gov-supervision-list': { name: '督查督办', type: 'search_list' },
  'report-dashboard-general': { name: '综合统计', type: 'chart' },
  'report-center-home': { name: '报表中心', type: 'business' },
  'report-export-center': { name: '导出中心', type: 'business' },
  'report-exec-screen': { name: '领导驾驶舱', type: 'report' },
  'report-doc-list': { name: '报告台账', type: 'search_list' },
  'report-doc-edit': { name: '报告编制', type: 'form' },
  'report-doc-detail': { name: '报告详情', type: 'layout' },
  'report-doc-templates': { name: '报告模板', type: 'business' },
}

export function buildExtendedSchemaSeeds(
  placeholder: (canvas: { width: number; height: number }) => Record<string, unknown>,
): BusinessSchemaSeedSpec[] {
  return EXTENDED_DELIVERABLE_CODES.map((code) => {
    const meta = EXTENDED_META[code] ?? { name: code, type: 'business' as const }
    const isForm = meta.type === 'form'
    const isChart = meta.type === 'chart' || meta.type === 'report'
    const canvas = isForm
      ? { width: 960, height: 900 }
      : isChart
        ? { width: 1920, height: 900 }
        : { width: 1440, height: 900 }
    return {
      code,
      name: meta.name,
      type: meta.type,
      json: placeholder(canvas),
    }
  })
}

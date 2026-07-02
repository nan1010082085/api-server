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
          sumField: 'totalAmount',
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

/** OA-06 出差申请 — 见 patterns/oaTripPages.ts */
export { buildOaTripApplyPage } from './oaTripPages.js'

/** OA-08/09/10 用印 · 公文 — 见 patterns/oaSealDocPages.ts */
export {
  buildOaSealApplyPage,
  buildOaDocReceivePage,
  buildOaDocDraftPage,
} from './oaSealDocPages.js'

/** FI-04 采购申请 — 明细行 + 供应商 + 紧急程度 */
export function buildFinPurchaseApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const schema = refs.schemas['fin-purchase-apply']
  const formId = 'form_main'
  return {
    widgets: [
      titleWidget('purchase-title', '采购申请'),
      {
        id: formId,
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
        label: '采购标题',
        field: 'title',
        formId,
        position: { x: 48, y: 120, w: 680, h: 40, zIndex: 3 },
        props: { placeholder: '采购标题' },
        validationRules: [{ required: true, message: '必填' }],
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'purchase-items',
        type: 'dynamic-detail-table',
        name: 'FgDynamicDetailTable',
        label: '采购明细',
        field: 'items',
        formId,
        position: { x: 48, y: 176, w: 840, h: 280, zIndex: 3 },
        props: {
          title: '采购物品',
          field: 'items',
          sumField: 'totalAmount',
          columns: [
            { prop: 'name', label: '物品', type: 'input' },
            { prop: 'qty', label: '数量', type: 'number' },
            { prop: 'unitPrice', label: '单价', type: 'number' },
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
        label: '预算总额',
        field: 'totalAmount',
        formId,
        position: { x: 48, y: 472, w: 300, h: 40, zIndex: 3 },
        props: { min: 0, precision: 2, disabled: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'field-supplier',
        type: 'input',
        name: 'FgInput',
        label: '供应商',
        field: 'supplier',
        formId,
        position: { x: 48, y: 528, w: 400, h: 40, zIndex: 3 },
        props: { placeholder: '供应商名称' },
        options: [],
        variables: [],
        events: [],
        rules: [],
      },
      {
        id: 'field-urgency',
        type: 'select',
        name: 'FgSelect',
        label: '紧急程度',
        field: 'urgency',
        formId,
        position: { x: 48, y: 584, w: 300, h: 40, zIndex: 3 },
        props: { placeholder: '请选择' },
        options: [
          { label: '普通', value: 'normal' },
          { label: '紧急', value: 'urgent' },
          { label: '特急', value: 'critical' },
        ],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'btn-submit',
        type: 'button',
        name: 'FgButton',
        label: '提交',
        position: { x: 48, y: 648, w: 120, h: 40, zIndex: 99 },
        props: { text: '提交采购', type: 'primary' },
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
    board: makeBoard(960, 780),
  }
}

/** HR-04 加班申请 — 见 patterns/hrFinModulePages.ts */
export { buildHrOvertimeApplyPage } from './hrFinModulePages.js'

/** HR-10 招聘 — 见 patterns/hrRecruitPages.ts */
export {
  buildHrRecruitApplyPage,
  buildHrRecruitOfferPage,
} from './hrRecruitPages.js'

/** GA-01 事项受理 — 见 patterns/govCasePages.ts */
export { buildGovCaseApplyPage } from './govCasePages.js'

/** HR-06 入职办理 — 见 patterns/hrOnboardPages.ts */
export { buildHrOnboardApplyPage } from './hrOnboardPages.js'

/** HR-07 离职办理 — 见 patterns/hrResignPages.ts */
export { buildHrResignApplyPage } from './hrResignPages.js'

/** OA-12 资产领用 — 见 patterns/oaAssetPages.ts */
export { buildOaAssetApplyPage } from './oaAssetPages.js'

/** FI-10 付款申请 */
/** FI-05 付款申请 — 见 patterns/hrFinModulePages.ts */
export { buildFinPaymentApplyPage } from './hrFinModulePages.js'

/** FI-13 发票登记 — 见 patterns/finInvoicePages.ts */
export { buildFinInvoiceRegisterPage } from './finInvoicePages.js'

/** FI-08 预算编制 — 见 patterns/finBudgetPages.ts */
export { buildFinBudgetEditPage } from './finBudgetPages.js'

/** FI-17 资金计划 */
export function buildFinCashPlanPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '资金计划',
    submitSchemaCode: 'fin-cash-plan',
    refs,
    fields: [
      { field: 'planMonth', label: '计划月份', type: 'input', props: { placeholder: '如 2026-07' }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'totalInflow', label: '预计流入', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'totalOutflow', label: '预计流出', type: 'number', name: 'FgNumber', props: { min: 0, precision: 2 }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'remark', label: '说明', type: 'textarea', name: 'FgTextarea', props: { rows: 3 }, validationRules: [{ required: true, message: '必填' }] },
    ],
  })
}

/** ME-02 器具登记 */
export function buildMetrologyDeviceRegisterPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '器具登记',
    submitSchemaCode: 'metrology-device-register',
    refs,
    fields: [
      { field: 'deviceCode', label: '器具编号', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'deviceName', label: '器具名称', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'modelSpec', label: '型号规格', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'department', label: '使用部门', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      {
        field: 'calibrationCycle',
        label: '检定周期',
        type: 'select',
        name: 'FgSelect',
        options: [
          { label: '12 个月', value: '12' },
          { label: '24 个月', value: '24' },
        ],
        validationRules: [{ required: true, message: '必填' }],
      },
      { field: 'installDate', label: '启用日期', type: 'date', name: 'FgDate', validationRules: [{ required: true, message: '必填' }] },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 } },
    ],
  })
}

/** ME-04 检定计划 */
export function buildMetrologyCalibrationPlanPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '检定计划',
    submitSchemaCode: 'metrology-calibration-plan',
    refs,
    fields: [
      { field: 'planYear', label: '计划年度', type: 'input', props: { placeholder: '如 2026' }, validationRules: [{ required: true, message: '必填' }] },
      {
        field: 'planQuarter',
        label: '计划季度',
        type: 'select',
        name: 'FgSelect',
        options: [
          { label: '第一季度', value: 'Q1' },
          { label: '第二季度', value: 'Q2' },
          { label: '第三季度', value: 'Q3' },
          { label: '第四季度', value: 'Q4' },
        ],
        validationRules: [{ required: true, message: '必填' }],
      },
      { field: 'deviceCodes', label: '器具编号（多个用逗号分隔）', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'plannedDate', label: '计划检定日期', type: 'date', name: 'FgDate', validationRules: [{ required: true, message: '必填' }] },
      { field: 'calibrationOrg', label: '检定机构', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 } },
    ],
  })
}

/** EQ-04 装备领用 */
export function buildEquipmentBorrowApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '装备领用',
    submitSchemaCode: 'equipment-borrow-apply',
    refs,
    fields: [
      { field: 'equipmentName', label: '装备名称', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'borrowerName', label: '领用人', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'department', label: '领用部门', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      { field: 'purpose', label: '用途', type: 'textarea', name: 'FgTextarea', props: { rows: 2 }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'expectedReturnDate', label: '预计归还日期', type: 'date', name: 'FgDate', validationRules: [{ required: true, message: '必填' }] },
      { field: 'remark', label: '备注', type: 'textarea', name: 'FgTextarea', props: { rows: 2 } },
    ],
  })
}

/** 报告编制 */
export function buildReportDocEditPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildApplyFormPage({
    title: '报告编制',
    submitSchemaCode: 'report-doc-edit',
    refs,
    fields: [
      { field: 'title', label: '报告标题', type: 'input', validationRules: [{ required: true, message: '必填' }] },
      {
        field: 'reportType',
        label: '报告类型',
        type: 'select',
        name: 'FgSelect',
        options: [
          { label: '月度报告', value: 'monthly' },
          { label: '季度报告', value: 'quarterly' },
          { label: '专项报告', value: 'special' },
        ],
        validationRules: [{ required: true, message: '必填' }],
      },
      { field: 'reportPeriod', label: '报告周期', type: 'input', props: { placeholder: '如 2026-Q2' }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'summary', label: '摘要', type: 'textarea', name: 'FgTextarea', props: { rows: 4 }, validationRules: [{ required: true, message: '必填' }] },
      { field: 'author', label: '编制人', type: 'input', validationRules: [{ required: true, message: '必填' }] },
    ],
  })
}

/** OA-05 会议预约 — 见 patterns/oaMeetingPages.ts */
export { buildOaMeetingBookPage as buildMeetingBookPage } from './oaMeetingPages.js'

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

function treeTablePage(title: string, apiUrl: string, columns: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('tree-title', title),
      {
        id: 'tree-table',
        type: 'tree-table',
        name: 'FgTreeTable',
        label: title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        props: {
          columns,
          rowKey: 'id',
          childrenKey: 'children',
          defaultExpandAll: true,
          stripe: true,
          border: true,
          height: 680,
        },
        api: { url: apiUrl, method: 'get', immediate: true },
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

export function buildHrOrgChartPage(): Record<string, unknown> {
  return treeTablePage('组织架构', '/depts?tree=true', [
    { prop: 'name', label: '部门名称', minWidth: 220 },
    { prop: 'leader', label: '负责人', minWidth: 120 },
    { prop: 'status', label: '状态', minWidth: 100 },
    { prop: 'sort', label: '排序', minWidth: 80 },
  ])
}

export function buildSysMenuManagePage(): Record<string, unknown> {
  return treeTablePage('菜单管理', '/menus?tree=true', [
    { prop: 'name', label: '菜单名称', minWidth: 200 },
    { prop: 'path', label: '路由', minWidth: 180 },
    { prop: 'type', label: '类型', minWidth: 80 },
    { prop: 'status', label: '状态', minWidth: 80 },
    { prop: 'sort', label: '排序', minWidth: 80 },
  ])
}

export function buildSysLoginLogPage(): Record<string, unknown> {
  return adminTablePage('登录日志', '/login-logs', [
    { prop: 'username', label: '用户', minWidth: 120, render: 'text' },
    { prop: 'ip', label: 'IP', minWidth: 140, render: 'text' },
    { prop: 'status', label: '结果', minWidth: 80, render: 'tag' },
    { prop: 'loginTime', label: '登录时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysPostManagePage(): Record<string, unknown> {
  return adminTablePage('岗位管理', '/posts', [
    { prop: 'name', label: '岗位名称', minWidth: 160, render: 'text' },
    { prop: 'code', label: '编码', minWidth: 120, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'sort', label: '排序', minWidth: 80, render: 'text' },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysTenantManagePage(): Record<string, unknown> {
  return adminTablePage('租户管理', '/tenants', [
    { prop: 'name', label: '租户名称', minWidth: 160, render: 'text' },
    { prop: 'code', label: '编码', minWidth: 120, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  ])
}

export function buildHrEmployeeProfilePage(): Record<string, unknown> {
  return adminTablePage('员工档案', '/users', [
    { prop: 'username', label: '账号', minWidth: 120, render: 'text' },
    { prop: 'displayName', label: '姓名', minWidth: 120, render: 'text' },
    { prop: 'email', label: '邮箱', minWidth: 160, render: 'text' },
    { prop: 'phone', label: '手机', minWidth: 120, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
  ])
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

export function buildNoticeListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const detail = refs.schemas['oa-notice-detail']
  const publish = refs.schemas['oa-notice-publish']
  const boardEvents: Array<Record<string, unknown>> = []
  if (publish?.publishId) {
    boardEvents.push({
      trigger: 'click',
      eventTarget: 'toolbar-add',
      actions: [{ type: 'navigate', navigatePath: '/app/editor/view', navigateQuery: { id: publish.publishId } }],
    })
  }
  if (detail?.publishId) {
    boardEvents.push({
      trigger: 'click',
      eventTarget: 'open-detail',
      actions: [{
        type: 'navigate',
        navigatePath: '/app/editor/view',
        navigateQuery: { id: detail.publishId, recordId: '{{row._id}}' },
      }],
    })
  }
  const page = adminTablePage('公告列表', '/notices', [
    { prop: 'title', label: '标题', minWidth: 200, render: 'link', linkEvent: 'open-detail' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true },
    { prop: 'publishAt', label: '发布时间', minWidth: 160, render: 'text' },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
  ])
  const board = page.board as Record<string, unknown>
  board.events = boardEvents
  return page
}

/** AU-06/07 审计问题 — 见 patterns/auditIssuePages.ts */
export {
  buildAuditIssueListPage,
  buildAuditIssueDetailPage,
  buildAuditRectifyTrackPage,
} from './auditIssuePages.js'

/** GA-03 办件详情 — 见 patterns/govCasePages.ts */
export { buildGovCaseDetailPage } from './govCasePages.js'

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
          dataSource: { type: 'api', url: '/submissions/record/{{variables.recordId}}/view', method: 'get', dataPath: 'data' },
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
        props: { text: '导出 Excel', type: 'primary' },
        events: [{
          trigger: 'click',
          actions: [{
            type: 'exportData',
            apiUrl: '/submissions/record/{{variables.recordId}}/export?format=xlsx',
            apiMethod: 'get',
            exportFileName: 'report.xlsx',
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

export interface FinStatsComboOptions {
  statApi?: string
  statDataPath?: string
  columns?: Array<Record<string, unknown>>
}

export function buildFinStatsComboPage(
  title: string,
  statLabel: string,
  tableApi: string,
  opts: FinStatsComboOptions = {},
): Record<string, unknown> {
  const statApi = opts.statApi ?? tableApi
  const statDataPath = opts.statDataPath ?? 'total'
  const columns = opts.columns ?? [
    { prop: 'title', label: '名称', minWidth: 160, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
  ]
  return {
    widgets: [
      titleWidget(`fin-${title}-title`, title),
      {
        id: 'fin-stat',
        type: 'statistic',
        name: 'FgStatistic',
        label: statLabel,
        position: { x: 24, y: 72, w: 280, h: 120, zIndex: 2 },
        props: { title: statLabel, value: 0, suffix: '项', apiUrl: statApi, responseDataPath: statDataPath },
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
          columns,
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

/** E-09 — 领导驾驶舱大屏（深色 canvas + KPI + 趋势图） */
export function buildReportExecScreenPage(): Record<string, unknown> {
  const statWidget = (id: string, label: string, path: string, x: number) => ({
    id,
    type: 'statistic',
    name: 'FgStatistic',
    label,
    position: { x, y: 72, w: 280, h: 140, zIndex: 2 },
    style: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px', color: '#fff' },
    props: {
      title: label,
      value: 0,
      apiUrl: '/dashboard',
      responseDataPath: path,
      refreshInterval: 30,
      valueStyle: { color: '#36cfc9', fontSize: '32px' },
    },
    options: [],
    variables: [],
    events: [],
    rules: [],
    validationRules: [],
  })

  return {
    widgets: [
      {
        id: 'exec-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 600, h: 48, zIndex: 1 },
        style: { color: '#e6f7ff', fontSize: '28px', fontWeight: '600' },
        props: { content: '领导驾驶舱', level: 2, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'exec-auto-refresh',
        type: 'auto-refresh',
        name: 'FgAutoRefresh',
        label: '自动刷新',
        position: { x: 1680, y: 20, w: 220, h: 36, zIndex: 10 },
        style: {},
        props: {
          intervalSeconds: 30,
          targets: 'exec-kpi-pending,exec-kpi-flow,exec-kpi-done,exec-kpi-month,exec-trend',
          showStatus: true,
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      statWidget('exec-kpi-pending', '待办审批', 'kpis.pendingApprovals', 24),
      statWidget('exec-kpi-flow', '运行中流程', 'flows.running', 328),
      statWidget('exec-kpi-done', '已完成流程', 'flows.completed', 632),
      statWidget('exec-kpi-month', '本月申请', 'submissions.thisMonth', 936),
      {
        id: 'exec-trend',
        type: 'bar-chart',
        name: 'FgBarChart',
        label: '审批趋势',
        position: { x: 24, y: 240, w: 1200, h: 420, zIndex: 3 },
        style: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px' },
        props: {
          title: '近7日审批完成量',
          xField: 'date',
          yField: 'count',
          colorScheme: 'dark',
          showLegend: false,
          refreshInterval: 30,
        },
        api: { url: '/dashboard', method: 'get', dataPath: 'trends.weeklyApprovals', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: {
      canvas: {
        width: 1920,
        height: 1080,
        widthUnit: 'px',
        heightUnit: 'px',
        backgroundColor: '#0b1a2e',
        padding: '24px',
      },
      variables: [],
      events: [],
    },
  }
}

export function buildReportCenterHomePage(): Record<string, unknown> {
  const shortcut = (id: string, label: string, y: number, path: string) => ({
    id,
    type: 'button',
    name: 'FgButton',
    label,
    position: { x: 24, y, w: 200, h: 40, zIndex: 2 },
    props: { text: label, type: 'primary', plain: true },
    options: [],
    variables: [],
    events: [{
      trigger: 'click',
      actions: [{ type: 'navigate', navigatePath: path }],
    }],
    rules: [],
    validationRules: [],
  })

  return {
    widgets: [
      titleWidget('report-home-title', '报表中心'),
      {
        id: 'report-stat-total',
        type: 'statistic',
        name: 'FgStatistic',
        label: '提交总量',
        position: { x: 24, y: 72, w: 260, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: { title: '我的提交总量', apiUrl: '/dashboard', responseDataPath: 'submissions.total' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'report-stat-month',
        type: 'statistic',
        name: 'FgStatistic',
        label: '本月提交',
        position: { x: 300, y: 72, w: 260, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: { title: '本月提交', apiUrl: '/dashboard', responseDataPath: 'submissions.thisMonth' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      shortcut('link-doc-list', '报告台账', 220, '/app/editor/view'),
      shortcut('link-export', '导出中心', 276, '/app/editor/view'),
      shortcut('link-exec', '领导驾驶舱', 332, '/app/editor/view'),
    ],
    board: makeBoard(960, 480),
  }
}

export function buildReportExportCenterPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  const detail = refs.schemas['report-doc-detail']
  const page = adminTablePage('导出中心', '/submissions', [
    { prop: 'title', label: '标题', minWidth: 180, render: 'text' },
    { prop: 'submitterName', label: '提交人', minWidth: 120, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'createdAt', label: '创建时间', minWidth: 160, render: 'text' },
    {
      prop: 'action',
      label: '操作',
      width: 120,
      fixed: 'right',
      render: 'buttons',
      buttons: [{ key: 'export', label: '导出', type: 'primary', size: 'small' }],
    },
  ])
  const board = page.board as Record<string, unknown>
  const events: Array<Record<string, unknown>> = [{
    trigger: 'click',
    eventTarget: 'export',
    actions: [{
      type: 'exportData',
      apiUrl: '/submissions/record/{{row._id}}/export?format=xlsx',
      apiMethod: 'get',
      exportFileName: 'export.xlsx',
    }],
  }]
  if (detail?.publishId) {
    events.push({
      trigger: 'click',
      eventTarget: 'row-view',
      actions: [{
        type: 'navigate',
        navigatePath: '/app/editor/view',
        navigateQuery: { id: detail.publishId, recordId: '{{row._id}}' },
      }],
    })
  }
  return { ...page, board: { ...board, events } }
}

export function buildReportDocTemplatesPage(): Record<string, unknown> {
  return adminTablePage('报告模板', '/templates?category=report', [
    { prop: 'name', label: '模板名称', minWidth: 180, render: 'text' },
    { prop: 'category', label: '分类', minWidth: 100, render: 'text' },
    { prop: 'widgetType', label: '类型', minWidth: 120, render: 'text' },
    { prop: 'usageCount', label: '使用次数', minWidth: 100, render: 'text' },
    { prop: 'updatedAt', label: '更新时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysOnlineUsersPage(): Record<string, unknown> {
  return adminTablePage('在线用户', '/online-users', [
    { prop: 'user.username', label: '账号', minWidth: 120, render: 'text' },
    { prop: 'user.displayName', label: '姓名', minWidth: 120, render: 'text' },
    { prop: 'ip', label: 'IP', minWidth: 140, render: 'text' },
    { prop: 'loginTime', label: '登录时间', minWidth: 160, render: 'text' },
    { prop: 'expireTime', label: '过期时间', minWidth: 160, render: 'text' },
  ])
}

export function buildFinContractDetailPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('contract-title', '合同详情'),
      {
        id: 'contract-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '合同信息',
        position: { x: 24, y: 72, w: 900, h: 320, zIndex: 2 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '合同基本信息',
          column: 2,
          border: true,
          dataSource: { type: 'api', url: '/submissions/record/{{variables.recordId}}/view', method: 'get', dataPath: 'data' },
          items: [
            { field: 'title', label: '合同名称' },
            { field: 'status', label: '状态' },
            { field: 'submitterName', label: '经办人' },
            { field: 'createdAt', label: '创建时间' },
            { field: 'reason', label: '备注' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'contract-timeline',
        type: 'flow-timeline',
        name: 'FgFlowTimeline',
        label: '审批记录',
        position: { x: 24, y: 408, w: 900, h: 280, zIndex: 3 },
        props: { title: '审批轨迹', instanceIdVariable: 'flowInstanceId' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 720, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
    ]),
  }
}

export function buildGovSupervisionKanbanPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('gov-sup-title', '督查督办'),
      {
        id: 'gov-kanban-refresh',
        type: 'auto-refresh',
        name: 'FgAutoRefresh',
        label: '自动刷新',
        position: { x: 1200, y: 24, w: 216, h: 36, zIndex: 10 },
        style: {},
        props: {
          intervalSeconds: 60,
          targets: 'gov-kanban',
          showStatus: true,
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'gov-kanban',
        type: 'kanban',
        name: 'FgKanban',
        label: '督办看板',
        position: { x: 24, y: 72, w: 1392, h: 480, zIndex: 2 },
        style: { width: '100%', minHeight: '420px' },
        props: {
          columns: [
            { key: 'open', title: '待整改', status: 'open' },
            { key: 'progress', title: '整改中', status: 'in_progress' },
            { key: 'closed', title: '已关闭', status: 'closed' },
          ],
          cardTitleField: 'title',
          cardSubtitleField: 'severity',
          statusField: 'status',
          updateUrl: '/audit/issues/{{id}}',
          updateMethod: 'put',
        },
        api: { url: '/audit/issues', method: 'get', dataPath: 'items', immediate: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 600),
  }
}

export function buildOaKnowledgeEntryPage(): Record<string, unknown> {
  return {
    widgets: [
      {
        id: 'kb-banner',
        type: 'banner',
        name: 'FgBanner',
        label: '知识库',
        position: { x: 24, y: 24, w: 912, h: 120, zIndex: 1 },
        props: {
          title: 'AI 知识库',
          description: '检索制度文档、上传 RAG 知识库，支持智能问答',
          type: 'info',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'kb-open',
        type: 'button',
        name: 'FgButton',
        label: '进入',
        position: { x: 24, y: 168, w: 160, h: 40, zIndex: 2 },
        props: { text: '进入知识库', type: 'primary' },
        options: [],
        variables: [],
        events: [{
          trigger: 'click',
          actions: [{ type: 'navigate', navigatePath: '/app/ai/rag' }],
        }],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 280),
  }
}

export function buildWorkbenchMessagesPage(): Record<string, unknown> {
  return adminTablePage('消息中心', '/business/notifications', [
    { prop: 'title', label: '标题', minWidth: 200, render: 'text' },
    { prop: 'type', label: '类型', minWidth: 100, render: 'tag' },
    { prop: 'read', label: '已读', minWidth: 80, render: 'text' },
    { prop: 'createdAt', label: '时间', minWidth: 160, render: 'text' },
  ])
}

export function buildSysMicroAppManagePage(): Record<string, unknown> {
  return adminTablePage('微应用管理', '/micro-apps', [
    { prop: 'name', label: '名称', minWidth: 160, render: 'text' },
    { prop: 'entry', label: '入口', minWidth: 220, render: 'text' },
    { prop: 'activeRule', label: '激活规则', minWidth: 160, render: 'text' },
    { prop: 'status', label: '状态', minWidth: 100, render: 'tag' },
    { prop: 'updatedAt', label: '更新时间', minWidth: 160, render: 'text' },
  ])
}

export function buildMetrologyDeviceDetailPage(): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('device-detail-title', '器具详情'),
      {
        id: 'device-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '器具信息',
        position: { x: 24, y: 72, w: 900, h: 360, zIndex: 2 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '器具基本信息',
          column: 2,
          border: true,
          dataSource: { type: 'api', url: '/metrology/devices/{{variables.recordId}}', method: 'get', dataPath: 'data' },
          items: [
            { field: 'code', label: '编号' },
            { field: 'name', label: '名称' },
            { field: 'model', label: '型号' },
            { field: 'calibrationDueAt', label: '到期日' },
            { field: 'expiryStatus', label: '预警' },
            { field: 'location', label: '位置' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 500),
  }
}

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

/** RP-09 自定义查询 — E-20 Adhoc 查询构建器 + 结果表 */
export function buildReportAdhocQueryPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  const tableId = 'adhoc-result-table'
  return {
    widgets: [
      titleWidget('adhoc-title', '自定义查询'),
      {
        id: 'adhoc-query',
        type: 'adhoc-query',
        name: 'FgAdhocQuery',
        label: '查询条件',
        position: { x: 24, y: 72, w: 1392, h: 160, zIndex: 2 },
        props: {
          targetTableId: tableId,
          fields: [
            { field: 'keyword', label: '关键词', type: 'input' },
            {
              field: 'status',
              label: '状态',
              type: 'select',
              options: [
                { label: '审批中', value: 'submitted' },
                { label: '已通过', value: 'approved' },
                { label: '已驳回', value: 'rejected' },
              ],
            },
            { field: 'module', label: '模块', type: 'input' },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: tableId,
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: '查询结果',
        position: { x: 24, y: 248, w: 1392, h: 620, zIndex: 3 },
        props: {
          columns: DEFAULT_LIST_COLUMNS,
          stripe: true,
          border: true,
          height: 520,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
        },
        api: { url: '/submissions', method: 'get', dataPath: 'items', immediate: true },
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

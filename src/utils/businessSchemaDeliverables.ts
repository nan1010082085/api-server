/**
 * Phase D1 — Deliverable Board JSON for leave module + workbench.
 * Built at seed time with resolved schema / flow IDs.
 */

export interface BusinessSchemaRefs {
  schemas: Record<string, { formSchemaId: string; publishId: string }>
  leaveFlowDefinitionId: string | null
}

export const LEAVE_TYPE_OPTIONS = [
  { label: '年假', value: 'annual' },
  { label: '病假', value: 'sick' },
  { label: '事假', value: 'personal' },
  { label: '婚假', value: 'marriage' },
]

export const LEAVE_STATUS_OPTIONS = [
  { label: '审批中', value: 'submitted' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

export const LEAVE_STATUS_COLOR_MAP: Record<string, string> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
}

export const DELIVERABLE_SCHEMA_CODES = [
  'dashboard-workbench',
  'hr-leave-apply',
  'hr-leave-list',
  'hr-leave-detail',
  'hr-leave-stats',
] as const

function makeBoard(width: number, height: number, variables: Record<string, unknown>[] = []) {
  return {
    canvas: {
      width,
      height,
      widthUnit: 'px',
      heightUnit: 'px',
      backgroundColor: '#f5f7fa',
      padding: '16px',
    },
    variables,
    events: [],
  }
}

function requiredRule(message: string) {
  return [{ required: true, message, trigger: 'blur' }]
}

/** 工作台 — statistic KPI + 快捷入口 */
export function buildDashboardWorkbenchSchema(refs: BusinessSchemaRefs): Record<string, unknown> {
  const leaveApplyPublishId = refs.schemas['hr-leave-apply']?.publishId ?? ''
  const leaveListPublishId = refs.schemas['hr-leave-list']?.publishId ?? ''

  return {
    widgets: [
      {
        id: 'wb-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 600, h: 48, zIndex: 1 },
        style: { fontSize: '24px', fontWeight: '600' },
        props: { content: '工作台', level: 2, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-stat-pending',
        type: 'statistic',
        name: 'FgStatistic',
        label: '待我审批',
        position: { x: 24, y: 80, w: 280, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '待我审批',
          value: 0,
          suffix: '件',
          trend: 'up',
          trendValue: '实时',
          color: '#409EFF',
          apiUrl: '/dashboard',
          responseDataPath: 'kpis.pendingApprovals',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-stat-monthly',
        type: 'statistic',
        name: 'FgStatistic',
        label: '本月申请',
        position: { x: 320, y: 80, w: 280, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '本月申请',
          value: 0,
          suffix: '单',
          trend: 'flat',
          color: '#67C23A',
          apiUrl: '/dashboard',
          responseDataPath: 'kpis.monthlyApplications',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-stat-initiated',
        type: 'statistic',
        name: 'FgStatistic',
        label: '我发起的流程',
        position: { x: 616, y: 80, w: 280, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '我发起的流程',
          value: 0,
          suffix: '个',
          trend: 'flat',
          color: '#E6A23C',
          apiUrl: '/dashboard',
          responseDataPath: 'flows.initiatedByMe',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-shortcuts-title',
        type: 'title',
        name: 'FgTitle',
        label: '快捷入口',
        position: { x: 24, y: 220, w: 400, h: 40, zIndex: 3 },
        style: { fontSize: '16px', fontWeight: '600' },
        props: { content: '快捷入口', level: 4, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-btn-leave-apply',
        type: 'button',
        name: 'FgButton',
        label: '请假申请',
        position: { x: 24, y: 272, w: 140, h: 40, zIndex: 4 },
        style: {},
        props: { text: '请假申请', type: 'primary', size: 'default' },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            actions: [
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: leaveApplyPublishId },
              },
            ],
          },
        ],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-btn-leave-list',
        type: 'button',
        name: 'FgButton',
        label: '请假台账',
        position: { x: 180, y: 272, w: 140, h: 40, zIndex: 4 },
        style: {},
        props: { text: '请假台账', type: 'default', size: 'default' },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            actions: [
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: leaveListPublishId },
              },
            ],
          },
        ],
        rules: [],
        validationRules: [],
      },
      {
        id: 'wb-btn-flow-tasks',
        type: 'button',
        name: 'FgButton',
        label: '我的待办',
        position: { x: 336, y: 272, w: 140, h: 40, zIndex: 4 },
        style: {},
        props: { text: '我的待办', type: 'success', size: 'default' },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            actions: [{ type: 'navigate', navigatePath: '/app/flow/tasks' }],
          },
        ],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1920, 1080),
  }
}

/** HR-01 请假申请 */
export function buildHrLeaveApplySchema(refs: BusinessSchemaRefs): Record<string, unknown> {
  const applyFormSchemaId = refs.schemas['hr-leave-apply']?.formSchemaId ?? ''
  const listPublishId = refs.schemas['hr-leave-list']?.publishId ?? ''

  const submitAction: Record<string, unknown> = {
    type: 'submitSubmission',
    schemaId: applyFormSchemaId,
  }

  return {
    widgets: [
      {
        id: 'apply-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 400, h: 48, zIndex: 1 },
        style: { fontSize: '22px', fontWeight: '600' },
        props: { content: '请假申请', level: 3, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'form_main',
        type: 'form',
        name: 'FgForm',
        label: '表单容器',
        position: { x: 24, y: 72, w: 912, h: 960, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '24px' },
        props: { labelWidth: '120px', labelPosition: 'right' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
        children: [],
      },
      {
        id: 'field-leaveType',
        type: 'select',
        name: 'FgSelect',
        label: '请假类型',
        field: 'leaveType',
        formId: 'form_main',
        position: { x: 48, y: 120, w: 400, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请选择请假类型', clearable: true },
        options: LEAVE_TYPE_OPTIONS,
        variables: [],
        events: [],
        rules: [],
        validationRules: requiredRule('请选择请假类型'),
      },
      {
        id: 'field-startTime',
        type: 'date',
        name: 'FgDate',
        label: '开始时间',
        field: 'startTime',
        formId: 'form_main',
        position: { x: 48, y: 180, w: 400, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请选择开始时间', type: 'datetime', format: 'YYYY-MM-DD HH:mm' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: requiredRule('请选择开始时间'),
      },
      {
        id: 'field-endTime',
        type: 'date',
        name: 'FgDate',
        label: '结束时间',
        field: 'endTime',
        formId: 'form_main',
        position: { x: 480, y: 180, w: 400, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请选择结束时间', type: 'datetime', format: 'YYYY-MM-DD HH:mm' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: requiredRule('请选择结束时间'),
      },
      {
        id: 'field-days',
        type: 'number',
        name: 'FgNumber',
        label: '请假天数',
        field: 'days',
        formId: 'form_main',
        position: { x: 480, y: 120, w: 400, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请输入天数', min: 0.5, step: 0.5, precision: 1 },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: requiredRule('请填写请假天数'),
        linkages: [
          {
            type: 'set-value',
            watchFields: ['startTime', 'endTime'],
            condition: 'values.startTime && values.endTime',
            thenValue: 1,
          },
        ],
      },
      {
        id: 'field-reason',
        type: 'textarea',
        name: 'FgTextarea',
        label: '请假事由',
        field: 'reason',
        formId: 'form_main',
        position: { x: 48, y: 240, w: 832, h: 100, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请填写请假事由', rows: 4, showWordLimit: true, maxlength: 500 },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: requiredRule('请填写请假事由'),
      },
      {
        id: 'field-agentUser',
        type: 'user-selector',
        name: 'FgUserSelector',
        label: '代理人',
        field: 'agentUser',
        formId: 'form_main',
        position: { x: 48, y: 360, w: 400, h: 40, zIndex: 3 },
        style: { width: '100%' },
        props: { placeholder: '请选择代理人（可选）', clearable: true, filterable: true },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'field-attachments',
        type: 'upload',
        name: 'FgUpload',
        label: '附件',
        field: 'attachments',
        formId: 'form_main',
        position: { x: 48, y: 420, w: 832, h: 80, zIndex: 3 },
        style: { width: '100%' },
        props: { multiple: true, limit: 5, buttonText: '上传附件', listType: 'text' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
        linkages: [
          {
            type: 'required',
            watchFields: ['leaveType'],
            condition: 'values.leaveType === "sick"',
          },
        ],
      },
      {
        id: 'btn-submit',
        type: 'button',
        name: 'FgButton',
        label: '提交',
        position: { x: 48, y: 520, w: 120, h: 40, zIndex: 4 },
        style: {},
        props: { text: '提交申请', type: 'primary', size: 'default' },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            confirm: '确认提交请假申请？',
            actions: [
              submitAction,
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: listPublishId },
              },
            ],
          },
        ],
        rules: [],
        validationRules: [],
      },
      {
        id: 'btn-reset',
        type: 'button',
        name: 'FgButton',
        label: '重置',
        position: { x: 180, y: 520, w: 100, h: 40, zIndex: 4 },
        style: {},
        props: { text: '重置', type: 'default', size: 'default' },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            actions: [{ type: 'reset', target: 'form_main' }],
          },
        ],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, 1200, [
      { name: 'pageMode', type: 'string', defaultValue: 'create' },
    ]),
  }
}

/** HR-02 请假台账 */
export function buildHrLeaveListSchema(refs: BusinessSchemaRefs): Record<string, unknown> {
  const applyFormSchemaId = refs.schemas['hr-leave-apply']?.formSchemaId ?? ''
  const applyPublishId = refs.schemas['hr-leave-apply']?.publishId ?? ''
  const detailPublishId = refs.schemas['hr-leave-detail']?.publishId ?? ''

  return {
    widgets: [
      {
        id: 'list-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 400, h: 48, zIndex: 1 },
        style: { fontSize: '22px', fontWeight: '600' },
        props: { content: '请假台账', level: 3, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'leave-table',
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: '请假台账',
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        style: { width: '100%', height: '780px' },
        props: {
          columns: [
            { prop: '_id', label: '单号', minWidth: 120, render: 'link', linkEvent: 'open-detail' },
            {
              prop: 'data.leaveType',
              label: '假别',
              minWidth: 90,
              render: 'tag',
              filterable: true,
              options: LEAVE_TYPE_OPTIONS,
            },
            { prop: 'data.days', label: '天数', width: 80, align: 'center', render: 'text' },
            {
              prop: 'status',
              label: '状态',
              minWidth: 100,
              render: 'tag',
              filterable: true,
              colorMap: LEAVE_STATUS_COLOR_MAP,
              options: LEAVE_STATUS_OPTIONS,
            },
            { prop: 'data.reason', label: '事由', minWidth: 180, render: 'text', showTooltip: true },
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
          toolbar: [{ key: 'add', label: '发起申请', type: 'primary', icon: 'plus' }],
          stripe: true,
          border: true,
          height: 680,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50, 100] },
          selection: { enabled: false },
        },
        api: {
          url: `/submissions/${applyFormSchemaId}`,
          method: 'get',
          dataPath: 'items',
          immediate: true,
        },
        options: [],
        variables: [],
        events: [
          {
            trigger: 'click',
            eventTarget: 'toolbar-add',
            actions: [
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: applyPublishId },
              },
            ],
          },
          {
            trigger: 'click',
            eventTarget: 'row-view',
            actions: [
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: detailPublishId, recordId: '{{row._id}}' },
              },
            ],
          },
          {
            trigger: 'click',
            eventTarget: 'link-_id',
            actions: [
              {
                type: 'navigate',
                navigatePath: '/app/editor/view',
                navigateQuery: { id: detailPublishId, recordId: '{{row._id}}' },
              },
            ],
          },
          {
            trigger: 'click',
            eventTarget: 'row-approve',
            actions: [{ type: 'navigate', navigatePath: '/app/flow/tasks' }],
          },
        ],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }
}

/** HR 请假详情（只读） */
export function buildHrLeaveDetailSchema(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return {
    widgets: [
      {
        id: 'detail-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 400, h: 48, zIndex: 1 },
        style: { fontSize: '22px', fontWeight: '600' },
        props: { content: '请假详情', level: 3, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'detail-desc',
        type: 'descriptions',
        name: 'FgDescriptions',
        label: '申请信息',
        position: { x: 24, y: 72, w: 1392, h: 400, zIndex: 2 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '申请信息',
          column: 2,
          border: true,
          staticData: {
            applicantName: '张三',
            leaveType: '年假',
            startTime: '2026-07-05 09:00',
            endTime: '2026-07-07 18:00',
            days: 3,
            reason: '家庭事务处理。',
            deptName: '研发部',
            status: '审批中',
            agentUser: '李四',
          },
          items: [
            { label: '申请人', field: 'applicantName', type: 'text' },
            {
              label: '假别',
              field: 'leaveType',
              type: 'tag',
              options: LEAVE_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
            },
            { label: '开始时间', field: 'startTime', type: 'text' },
            { label: '结束时间', field: 'endTime', type: 'text' },
            { label: '天数', field: 'days', type: 'text', suffix: '天' },
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
            { label: '代理人', field: 'agentUser', type: 'text' },
            { label: '事由', field: 'reason', type: 'text', span: 2 },
          ],
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 1400, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
    ]),
  }
}

/** HR-03 请假统计 */
export function buildHrLeaveStatsSchema(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return {
    widgets: [
      {
        id: 'stats-title',
        type: 'title',
        name: 'FgTitle',
        label: '标题',
        position: { x: 24, y: 16, w: 400, h: 48, zIndex: 1 },
        style: { fontSize: '22px', fontWeight: '600' },
        props: { content: '请假统计', level: 3, align: 'left' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'stats-count',
        type: 'statistic',
        name: 'FgStatistic',
        label: '本月请假人次',
        position: { x: 24, y: 72, w: 300, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '本月请假人次',
          value: 28,
          suffix: '人次',
          trend: 'up',
          trendValue: '较上月 +12%',
          color: '#409EFF',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'stats-avg-days',
        type: 'statistic',
        name: 'FgStatistic',
        label: '人均天数',
        position: { x: 340, y: 72, w: 300, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '人均请假天数',
          value: 2.4,
          suffix: '天',
          precision: 1,
          trend: 'flat',
          color: '#67C23A',
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'stats-bar-dept',
        type: 'bar-chart',
        name: 'FgBarChart',
        label: '部门对比',
        position: { x: 24, y: 210, w: 920, h: 360, zIndex: 3 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '各部门请假天数',
          staticData: [
            { category: '研发部', value: 42 },
            { category: '产品部', value: 28 },
            { category: '人事部', value: 15 },
            { category: '财务部', value: 12 },
            { category: '行政部', value: 8 },
          ],
          xField: 'category',
          yField: 'value',
          yAxisName: '天数',
          showLegend: false,
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'stats-line-trend',
        type: 'line-chart',
        name: 'FgLineChart',
        label: '月度趋势',
        position: { x: 960, y: 210, w: 920, h: 360, zIndex: 3 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '月度请假趋势',
          staticData: [
            { category: '1月', value: 18 },
            { category: '2月', value: 22 },
            { category: '3月', value: 15 },
            { category: '4月', value: 28 },
            { category: '5月', value: 24 },
            { category: '6月', value: 32 },
          ],
          xField: 'category',
          yField: 'value',
          yAxisName: '人次',
          smooth: true,
          area: true,
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1920, 900),
  }
}

const DELIVERABLE_BUILDERS: Record<
  (typeof DELIVERABLE_SCHEMA_CODES)[number],
  (refs: BusinessSchemaRefs) => Record<string, unknown>
> = {
  'dashboard-workbench': buildDashboardWorkbenchSchema,
  'hr-leave-apply': buildHrLeaveApplySchema,
  'hr-leave-list': buildHrLeaveListSchema,
  'hr-leave-detail': buildHrLeaveDetailSchema,
  'hr-leave-stats': buildHrLeaveStatsSchema,
}

export function buildDeliverableSchemaJson(
  code: (typeof DELIVERABLE_SCHEMA_CODES)[number],
  refs: BusinessSchemaRefs,
): Record<string, unknown> {
  return DELIVERABLE_BUILDERS[code](refs)
}

export function isDeliverableSchemaCode(code: string): code is (typeof DELIVERABLE_SCHEMA_CODES)[number] {
  return (DELIVERABLE_SCHEMA_CODES as readonly string[]).includes(code)
}

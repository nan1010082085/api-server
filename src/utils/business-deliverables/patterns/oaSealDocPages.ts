/**
 * OA-08/09/10 用印 · 公文收文 · 公文拟稿 — apply + list + detail
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildCrudSubmissionListPage } from './crudSubmissionListPage.js'
import {
  buildFlowSubmissionApplyPage,
  buildFlowSubmissionDetailPage,
  type FlowApplyFieldSpec,
} from './flowSubmissionPages.js'

export const SEAL_TYPE_OPTIONS = [
  { label: '公章', value: 'official' },
  { label: '合同章', value: 'contract' },
  { label: '财务章', value: 'finance' },
]

export const SEAL_STATUS_OPTIONS = [
  { label: '审批中', value: 'submitted' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

export const SEAL_STATUS_COLOR_MAP: Record<string, string> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'danger',
}

export const SECURITY_LEVEL_OPTIONS = [
  { label: '公开', value: 'public' },
  { label: '内部', value: 'internal' },
  { label: '秘密', value: 'secret' },
]

export const URGENCY_OPTIONS = [
  { label: '普通', value: 'normal' },
  { label: '加急', value: 'urgent' },
  { label: '特急', value: 'critical' },
]

function requiredRule(message: string) {
  return [{ required: true, message, trigger: 'blur' }]
}

function rowField(
  field: string,
  label: string,
  y: number,
  extra: Partial<FlowApplyFieldSpec> = {},
): FlowApplyFieldSpec {
  const h = extra.type === 'textarea' ? 100 : extra.type === 'upload' ? 80 : 40
  return {
    field,
    label,
    position: { x: 48, y, w: 832, h, ...(extra.position ?? {}) },
    ...extra,
  }
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

function sealDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '标题', field: 'title', type: 'text' },
    {
      label: '印章类型',
      field: 'sealType',
      type: 'tag',
      options: SEAL_TYPE_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '用印文件', field: 'documentName', type: 'text' },
    { label: '份数', field: 'copies', type: 'text' },
    { label: '用印日期', field: 'useDate', type: 'text' },
    {
      label: '紧急程度',
      field: 'urgency',
      type: 'tag',
      options: [
        { label: '普通', value: '普通', color: 'info' },
        { label: '紧急', value: '紧急', color: 'warning' },
      ],
    },
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
    { label: '附件', field: 'attachments', type: 'text' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '用印事由', field: 'reason', type: 'text', span: 2 },
  ]
}

function docReceiveDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '登记号', field: 'registerNo', type: 'text' },
    { label: '来文单位', field: 'sourceOrg', type: 'text' },
    { label: '文件标题', field: 'docTitle', type: 'text' },
    {
      label: '密级',
      field: 'securityLevel',
      type: 'tag',
      options: SECURITY_LEVEL_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '份数', field: 'copies', type: 'text' },
    { label: '收文日期', field: 'receiveDate', type: 'text' },
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '备注', field: 'remark', type: 'text', span: 2 },
  ]
}

function docDraftDetailItems(): Array<Record<string, unknown>> {
  return [
    { label: '申请人', field: 'applicantName', type: 'text' },
    { label: '文件标题', field: 'title', type: 'text' },
    { label: '主送', field: 'mainRecipients', type: 'text' },
    { label: '抄送', field: 'ccRecipients', type: 'text' },
    {
      label: '紧急程度',
      field: 'urgency',
      type: 'tag',
      options: URGENCY_OPTIONS.map((o) => ({ ...o, color: 'primary' })),
    },
    { label: '状态', field: 'status', type: 'tag' },
    { label: '流程状态', field: 'flowStatus', type: 'text' },
    { label: '当前节点', field: 'currentTask', type: 'text' },
    { label: '正文', field: 'body', type: 'text', span: 2 },
  ]
}

/** OA-08 用印申请 — P-02 */
export function buildOaSealApplyPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'oa-seal',
    title: '用印申请',
    titleWidgetId: 'seal-apply-title',
    applySchemaCode: 'oa-seal-apply',
    listSchemaCode: 'oa-seal-list',
    refs,
    boardHeight: 900,
    confirmMessage: '确认提交用印申请？',
    fields: [
      rowField('title', '标题', 120, { validationRules: requiredRule('请输入标题') }),
      rowField('sealType', '印章类型', 180, {
        type: 'select',
        name: 'FgSelect',
        options: SEAL_TYPE_OPTIONS,
        props: { placeholder: '请选择印章类型', clearable: true },
        validationRules: requiredRule('请选择印章类型'),
      }),
      rowField('documentName', '用印文件名称', 240, {
        validationRules: requiredRule('请填写用印文件名称'),
      }),
      rowField('copies', '份数', 300, {
        type: 'number',
        name: 'FgNumber',
        props: { min: 1 },
        validationRules: requiredRule('请填写份数'),
      }),
      rowField('useDate', '用印日期', 360, {
        type: 'date',
        name: 'FgDate',
        validationRules: requiredRule('请选择用印日期'),
      }),
      rowField('urgency', '紧急程度', 420, {
        type: 'select',
        name: 'FgSelect',
        options: [
          { label: '普通', value: 'normal' },
          { label: '紧急', value: 'urgent' },
        ],
        validationRules: requiredRule('请选择紧急程度'),
      }),
      rowField('reason', '用印事由', 480, {
        type: 'textarea',
        name: 'FgTextarea',
        props: { rows: 3 },
        validationRules: requiredRule('请填写用印事由'),
      }),
      rowField('attachments', '用印文件', 600, {
        type: 'upload',
        name: 'FgUpload',
        props: { multiple: true, limit: 5, buttonText: '上传用印文件', listType: 'text' },
      }),
    ],
  })
}

/** OA-08b 用印台账 — P-01 */
export function buildOaSealListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-seal-list',
    title: '用印台账',
    tableId: 'seal-table',
    applySchemaCode: 'oa-seal-apply',
    detailSchemaCode: 'oa-seal-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '申请人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 140, render: 'text', showTooltip: true },
      {
        prop: 'data.sealType',
        label: '印章',
        width: 90,
        render: 'tag',
        filterable: true,
        options: SEAL_TYPE_OPTIONS,
      },
      { prop: 'data.documentName', label: '文件', minWidth: 140, render: 'text' },
      { prop: 'data.copies', label: '份数', width: 70, align: 'center', render: 'text' },
      {
        prop: 'status',
        label: '状态',
        minWidth: 100,
        render: 'tag',
        filterable: true,
        colorMap: SEAL_STATUS_COLOR_MAP,
        options: SEAL_STATUS_OPTIONS,
      },
      { prop: 'flowStatus', label: '流程状态', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '申请时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/申请人/文件' },
      { field: 'sealType', label: '印章', type: 'select', options: SEAL_TYPE_OPTIONS },
      { field: 'status', label: '状态', type: 'select', options: SEAL_STATUS_OPTIONS },
    ],
    dialog: {
      dialogTitle: '用印详情',
      detailApiUrl: '/business/oa/seal/detail',
      descriptionItems: sealDetailItems(),
      exportFilename: '用印台账',
    },
  })
}

/** OA-08c 用印详情 — P-03 */
export function buildOaSealDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'seal-detail',
    title: '用印详情',
    detailApiUrl: '/business/oa/seal/detail',
    descriptionItems: sealDetailItems(),
  })
}

/** OA-09 公文收文 — P-02 */
export function buildOaDocReceivePage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'oa-doc-receive',
    title: '公文收文登记',
    titleWidgetId: 'doc-receive-title',
    applySchemaCode: 'oa-doc-receive',
    listSchemaCode: 'oa-doc-receive-list',
    refs,
    boardHeight: 880,
    confirmMessage: '确认提交收文登记？',
    fields: [
      rowField('registerNo', '登记号', 120, { props: { placeholder: '留空自动生成' } }),
      rowField('sourceOrg', '来文单位', 180, { validationRules: requiredRule('必填') }),
      rowField('docTitle', '文件标题', 240, { validationRules: requiredRule('必填') }),
      rowField('securityLevel', '密级', 300, {
        type: 'select',
        name: 'FgSelect',
        options: SECURITY_LEVEL_OPTIONS,
        validationRules: requiredRule('必填'),
      }),
      rowField('copies', '份数', 360, {
        type: 'number',
        name: 'FgNumber',
        props: { min: 1 },
        validationRules: requiredRule('必填'),
      }),
      rowField('receiveDate', '收文日期', 420, {
        type: 'date',
        name: 'FgDate',
        validationRules: requiredRule('必填'),
      }),
      rowField('remark', '备注', 480, {
        type: 'textarea',
        name: 'FgTextarea',
        props: { rows: 2 },
      }),
    ],
  })
}

export function buildOaDocReceiveListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-doc-receive-list',
    title: '收文台账',
    tableId: 'doc-receive-table',
    applySchemaCode: 'oa-doc-receive',
    detailSchemaCode: 'oa-doc-receive-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'data.registerNo', label: '登记号', minWidth: 110, render: 'text' },
      { prop: 'data.sourceOrg', label: '来文单位', minWidth: 140, render: 'text' },
      { prop: 'data.docTitle', label: '标题', minWidth: 160, render: 'text', showTooltip: true },
      {
        prop: 'data.securityLevel',
        label: '密级',
        width: 90,
        render: 'tag',
        options: SECURITY_LEVEL_OPTIONS,
      },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: SEAL_STATUS_OPTIONS, colorMap: SEAL_STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '登记时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '登记号/来文单位/标题' },
      { field: 'securityLevel', label: '密级', type: 'select', options: SECURITY_LEVEL_OPTIONS },
    ],
    dialog: {
      dialogTitle: '收文详情',
      detailApiUrl: '/business/oa/doc/receive/detail',
      descriptionItems: docReceiveDetailItems(),
      exportFilename: '收文台账',
    },
  })
}

export function buildOaDocReceiveDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'doc-receive-detail',
    title: '收文详情',
    detailApiUrl: '/business/oa/doc/receive/detail',
    descriptionItems: docReceiveDetailItems(),
  })
}

/** OA-10 公文拟稿 — P-02 */
export function buildOaDocDraftPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionApplyPage({
    code: 'oa-doc-draft',
    title: '公文拟稿',
    titleWidgetId: 'doc-draft-title',
    applySchemaCode: 'oa-doc-draft',
    listSchemaCode: 'oa-doc-draft-list',
    refs,
    boardHeight: 1000,
    confirmMessage: '确认提交拟稿？',
    fields: [
      rowField('title', '文件标题', 120, { validationRules: requiredRule('必填') }),
      rowField('mainRecipients', '主送', 180, { validationRules: requiredRule('必填') }),
      rowField('ccRecipients', '抄送', 240),
      rowField('urgency', '紧急程度', 300, {
        type: 'select',
        name: 'FgSelect',
        options: URGENCY_OPTIONS,
        validationRules: requiredRule('必填'),
      }),
      rowField('body', '正文', 360, {
        type: 'textarea',
        name: 'FgTextarea',
        props: { rows: 8 },
        validationRules: requiredRule('必填'),
      }),
    ],
  })
}

export function buildOaDocDraftListPage(refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildCrudSubmissionListPage({
    code: 'oa-doc-draft-list',
    title: '拟稿台账',
    tableId: 'doc-draft-table',
    applySchemaCode: 'oa-doc-draft',
    detailSchemaCode: 'oa-doc-draft-detail',
    refs,
    columns: [
      { prop: '_id', label: '单号', minWidth: 120, render: 'link' },
      { prop: 'submitterName', label: '拟稿人', minWidth: 100, render: 'text' },
      { prop: 'data.title', label: '标题', minWidth: 180, render: 'text', showTooltip: true },
      { prop: 'data.mainRecipients', label: '主送', minWidth: 120, render: 'text' },
      {
        prop: 'data.urgency',
        label: '紧急',
        width: 90,
        render: 'tag',
        options: URGENCY_OPTIONS,
      },
      { prop: 'status', label: '状态', minWidth: 100, render: 'tag', filterable: true, options: SEAL_STATUS_OPTIONS, colorMap: SEAL_STATUS_COLOR_MAP },
      { prop: 'flowStatus', label: '流程', minWidth: 110, render: 'flowStatus' },
      { prop: 'createdAt', label: '拟稿时间', minWidth: 160, render: 'text' },
      listActionColumn(),
    ],
    searchFields: [
      { field: 'keyword', label: '关键词', type: 'input', placeholder: '单号/标题/主送' },
      { field: 'urgency', label: '紧急程度', type: 'select', options: URGENCY_OPTIONS },
    ],
    dialog: {
      dialogTitle: '拟稿详情',
      detailApiUrl: '/business/oa/doc/draft/detail',
      descriptionItems: docDraftDetailItems(),
      exportFilename: '拟稿台账',
    },
  })
}

export function buildOaDocDraftDetailPage(_refs: BusinessSchemaRefs): Record<string, unknown> {
  return buildFlowSubmissionDetailPage({
    code: 'doc-draft-detail',
    title: '拟稿详情',
    detailApiUrl: '/business/oa/doc/draft/detail',
    descriptionItems: docDraftDetailItems(),
  })
}

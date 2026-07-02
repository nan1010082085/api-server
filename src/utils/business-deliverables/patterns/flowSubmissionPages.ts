/**
 * P-02 / P-03 — 流程业务申请页 & 全屏审批详情页
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildSchemaViewPath } from '../../menuPath.js'
import { makeBoard, titleWidget } from './pageBuilders.js'

export interface FlowApplyFieldSpec {
  field: string
  label: string
  type?: string
  name?: string
  props?: Record<string, unknown>
  api?: Record<string, unknown>
  options?: unknown[]
  rules?: unknown[]
  validationRules?: unknown[]
  linkages?: unknown[]
  position: { x: number; y: number; w: number; h: number; zIndex?: number }
}

export interface FlowSubmissionApplyConfig {
  code: string
  title: string
  titleWidgetId?: string
  applySchemaCode: string
  listSchemaCode?: string
  refs: BusinessSchemaRefs
  fields: FlowApplyFieldSpec[]
  formId?: string
  boardHeight?: number
  confirmMessage?: string
  boardVariables?: Array<Record<string, unknown>>
}

export interface FlowSubmissionDetailConfig {
  code: string
  title: string
  detailApiUrl: string
  descriptionItems: Array<Record<string, unknown>>
  staticData?: Record<string, unknown>
  showApproval?: boolean
  showAiSuggestion?: boolean
}

function defaultFormContainer(formId: string) {
  return {
    id: formId,
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
  }
}

/** P-02 流程申请页：表单容器 + 字段 + 提交/重置 */
export function buildFlowSubmissionApplyPage(config: FlowSubmissionApplyConfig): Record<string, unknown> {
  const formId = config.formId ?? 'form_main'
  const applyFormSchemaId = config.refs.schemas[config.applySchemaCode]?.formSchemaId ?? ''
  const titleId = config.titleWidgetId ?? `${config.code}-apply-title`
  const maxFieldY = config.fields.reduce((max, f) => Math.max(max, f.position.y + f.position.h), 0)
  const buttonY = maxFieldY + 40

  const submitActions: Array<Record<string, unknown>> = [
    { type: 'submitSubmission', schemaId: applyFormSchemaId, validateFormId: formId },
  ]
  if (config.listSchemaCode) {
    submitActions.push({ type: 'navigate', navigatePath: buildSchemaViewPath(config.listSchemaCode) })
  }

  const fieldWidgets = config.fields.map((field) => ({
    id: `field-${field.field}`,
    type: field.type ?? 'input',
    name: field.name ?? 'FgInput',
    label: field.label,
    field: field.field,
    formId,
    position: { ...field.position, zIndex: field.position.zIndex ?? 3 },
    style: { width: '100%' },
    props: field.props ?? { placeholder: field.label },
    api: field.api,
    options: field.options ?? [],
    variables: [],
    events: [],
    rules: field.rules ?? [],
    validationRules: field.validationRules ?? [],
    linkages: field.linkages,
  }))

  return {
    widgets: [
      titleWidget(titleId, config.title),
      defaultFormContainer(formId),
      ...fieldWidgets,
      {
        id: 'btn-submit',
        type: 'button',
        name: 'FgButton',
        label: '提交',
        position: { x: 48, y: buttonY, w: 120, h: 40, zIndex: 4 },
        style: {},
        props: { text: '提交申请', type: 'primary' },
        options: [],
        variables: [],
        events: [{
          trigger: 'click',
          confirm: config.confirmMessage ?? `确认提交${config.title}？`,
          actions: submitActions,
        }],
        rules: [],
        validationRules: [],
      },
      {
        id: 'btn-reset',
        type: 'button',
        name: 'FgButton',
        label: '重置',
        position: { x: 180, y: buttonY, w: 100, h: 40, zIndex: 4 },
        style: {},
        props: { text: '重置', type: 'default' },
        options: [],
        variables: [],
        events: [{ trigger: 'click', actions: [{ type: 'reset', target: formId }] }],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(960, config.boardHeight ?? buttonY + 120, config.boardVariables ?? [
      { name: 'pageMode', type: 'string', defaultValue: 'create' },
    ]),
  }
}

/** P-03 全屏审批详情：Descriptions + Timeline + 审批操作 */
export function buildFlowSubmissionDetailPage(config: FlowSubmissionDetailConfig): Record<string, unknown> {
  const prefix = config.code
  const commentId = `${prefix}-comment`
  const showApproval = config.showApproval !== false

  const widgets: Array<Record<string, unknown>> = [
    titleWidget(`${prefix}-title`, config.title),
    {
      id: `${prefix}-desc`,
      type: 'descriptions',
      name: 'FgDescriptions',
      label: '申请信息',
      position: { x: 24, y: 72, w: 1392, h: 420, zIndex: 2 },
      style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
      props: {
        title: '申请信息',
        column: 2,
        border: true,
        dataSource: {
          type: 'api',
          url: `${config.detailApiUrl}?recordId={{variables.recordId}}`,
        },
        ...(config.staticData ? { staticData: config.staticData } : {}),
        items: config.descriptionItems,
      },
      options: [],
      variables: [],
      events: [],
      rules: [],
      validationRules: [],
    },
    {
      id: `${prefix}-timeline`,
      type: 'flow-timeline',
      name: 'FgFlowTimeline',
      label: '审批记录',
      position: { x: 24, y: 510, w: 1392, h: 280, zIndex: 3 },
      style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
      props: { title: '审批记录', instanceIdVariable: 'flowInstanceId' },
      options: [],
      variables: [],
      events: [],
      rules: [],
      validationRules: [],
    },
  ]

  if (showApproval) {
    widgets.push(
      {
        id: commentId,
        type: 'approval-comment',
        name: 'FgApprovalComment',
        label: '审批意见',
        field: 'approvalComment',
        position: { x: 24, y: 810, w: 1392, h: 120, zIndex: 4 },
        style: { width: '100%' },
        props: { placeholder: '请输入审批意见', rows: 3 },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: `${prefix}-actions`,
        type: 'flow-task-actions',
        name: 'FgFlowTaskActions',
        label: '审批操作',
        position: { x: 24, y: 950, w: 1392, h: 160, zIndex: 5 },
        style: { width: '100%', backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '审批操作',
          taskIdVariable: 'taskId',
          instanceIdVariable: 'flowInstanceId',
          commentWidgetId: commentId,
          showAiSuggestion: config.showAiSuggestion !== false,
        },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    )
  }

  return {
    widgets,
    board: makeBoard(1440, showApproval ? 1400 : 900, [
      { name: 'recordId', type: 'string', defaultValue: '' },
      { name: 'flowInstanceId', type: 'string', defaultValue: '' },
      { name: 'taskId', type: 'string', defaultValue: '' },
    ]),
  }
}

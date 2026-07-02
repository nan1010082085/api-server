/**
 * P-01 — 流程业务台账页：FgCrudListPage 单 Widget（E-45）
 */
import type { BusinessSchemaRefs } from '../types.js'
import { buildSchemaViewPath } from '../../menuPath.js'
import { makeBoard, titleWidget } from './pageBuilders.js'

export interface CrudListDialogConfig {
  dialogTitle: string
  detailApiUrl: string
  descriptionItems: Array<Record<string, unknown>>
  exportFilename: string
}

export interface CrudSubmissionListConfig {
  code: string
  title: string
  tableId: string
  applySchemaCode: string
  detailSchemaCode: string
  refs: BusinessSchemaRefs
  columns: Array<Record<string, unknown>>
  searchFields: Array<Record<string, unknown>>
  dialog: CrudListDialogConfig
}

export interface GenericCrudListConfig {
  code: string
  title: string
  applySchemaCode: string
  detailSchemaCode?: string
  refs: BusinessSchemaRefs
  columns: Array<Record<string, unknown>>
  searchFields?: Array<Record<string, unknown>>
  addLabel?: string
  exportFilename?: string
}

function crudListWidgetProps(
  config: {
    columns: Array<Record<string, unknown>>
    searchFields: Array<Record<string, unknown>>
    applySchemaCode: string
    detailSchemaCode?: string
    applyFormSchemaId: string
    addLabel: string
    exportFilename: string
    dialog?: CrudListDialogConfig
  },
): Record<string, unknown> {
  const detailPath = config.detailSchemaCode
    ? buildSchemaViewPath(config.detailSchemaCode)
    : undefined

  const props: Record<string, unknown> = {
    columns: config.columns,
    toolbar: [
      { key: 'add', label: config.addLabel, type: 'primary', icon: 'plus' },
      { key: 'export', label: '导出 Excel', type: 'default', icon: 'download' },
    ],
    searchBar: {
      enabled: config.searchFields.length > 0,
      fields: config.searchFields,
    },
    stripe: true,
    border: true,
    height: 680,
    pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50, 100] },
    selection: { enabled: false },
    pageActions: {
      applyNavigatePath: buildSchemaViewPath(config.applySchemaCode),
      ...(detailPath ? { approveNavigatePath: detailPath } : {}),
      export: {
        apiUrl: `/submissions/${config.applyFormSchemaId}/export?format=xlsx`,
        filename: config.exportFilename,
      },
    },
  }

  if (config.dialog?.detailApiUrl) {
    props.detailDialog = {
      title: config.dialog.dialogTitle,
      detailApiUrl: `${config.dialog.detailApiUrl}?recordId={{recordId}}`,
      descriptionItems: config.dialog.descriptionItems,
      showFlowTimeline: true,
      confirmNavigatePath: detailPath,
      confirmText: '全屏审批',
    }
  }

  return props
}

/** 通用 submission 台账（无域详情 API 时查看/审批跳转全屏详情页） */
export function buildGenericCrudSubmissionListPage(config: GenericCrudListConfig): Record<string, unknown> {
  const applyFormSchemaId = config.refs.schemas[config.applySchemaCode]?.formSchemaId ?? ''
  const tableId = `${config.code}-table`
  const searchFields = config.searchFields ?? []

  return {
    widgets: [
      titleWidget(`${config.code}-title`, config.title),
      {
        id: tableId,
        type: 'crud-list-page',
        name: 'FgCrudListPage',
        label: config.title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        style: { width: '100%', height: '780px' },
        props: crudListWidgetProps({
          columns: config.columns,
          searchFields,
          applySchemaCode: config.applySchemaCode,
          detailSchemaCode: config.detailSchemaCode,
          applyFormSchemaId,
          addLabel: config.addLabel ?? '新建',
          exportFilename: config.exportFilename ?? config.title,
        }),
        api: {
          url: `/submissions/${applyFormSchemaId}`,
          method: 'get',
          dataPath: 'items',
          immediate: true,
        },
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

export function buildCrudSubmissionListPage(config: CrudSubmissionListConfig): Record<string, unknown> {
  const applyFormSchemaId = config.refs.schemas[config.applySchemaCode]?.formSchemaId ?? ''
  const { dialog } = config

  return {
    widgets: [
      titleWidget(`${config.code}-title`, config.title),
      {
        id: config.tableId,
        type: 'crud-list-page',
        name: 'FgCrudListPage',
        label: config.title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        style: { width: '100%', height: '780px' },
        props: crudListWidgetProps({
          columns: config.columns,
          searchFields: config.searchFields,
          applySchemaCode: config.applySchemaCode,
          detailSchemaCode: config.detailSchemaCode,
          applyFormSchemaId,
          addLabel: '发起申请',
          exportFilename: dialog.exportFilename,
          dialog,
        }),
        api: {
          url: `/submissions/${applyFormSchemaId}`,
          method: 'get',
          dataPath: 'items',
          immediate: true,
        },
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

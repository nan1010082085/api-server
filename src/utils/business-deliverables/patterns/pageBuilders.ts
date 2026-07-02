/**
 * Reusable Board JSON page builders for business deliverables.
 */
import type { BusinessSchemaRefs } from '../types.js'

export function makeBoard(width: number, height: number, variables: Record<string, unknown>[] = []) {
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

export function titleWidget(id: string, content: string, y = 16) {
  return {
    id,
    type: 'title',
    name: 'FgTitle',
    label: '标题',
    position: { x: 24, y, w: 480, h: 48, zIndex: 1 },
    style: { fontSize: '22px', fontWeight: '600' },
    props: { content, level: 3, align: 'left' },
    options: [],
    variables: [],
    events: [],
    rules: [],
    validationRules: [],
  }
}

export interface ListPageOptions {
  code: string
  title: string
  applyCode?: string
  detailCode?: string
  columns: Array<Record<string, unknown>>
  refs: BusinessSchemaRefs
}

export function buildSubmissionListPage(opts: ListPageOptions): Record<string, unknown> {
  const apply = opts.applyCode ? opts.refs.schemas[opts.applyCode] : undefined
  const detail = opts.detailCode ? opts.refs.schemas[opts.detailCode] : undefined
  const tableId = `${opts.code}-table`

  const events: Array<Record<string, unknown>> = []
  if (apply?.publishId) {
    events.push({
      trigger: 'click',
      eventTarget: 'toolbar-add',
      actions: [{ type: 'navigate', navigatePath: '/app/editor/view', navigateQuery: { id: apply.publishId } }],
    })
  }
  if (detail?.publishId) {
    events.push({
      trigger: 'click',
      eventTarget: 'row-view',
      actions: [{
        type: 'navigate',
        navigatePath: '/app/editor/view',
        navigateQuery: { id: detail.publishId, recordId: '{{row._id}}', flowInstanceId: '{{row.flowInstanceId}}', taskId: '{{row.viewerTaskId}}' },
      }],
    })
  }

  return {
    widgets: [
      titleWidget(`${opts.code}-title`, opts.title),
      {
        id: tableId,
        type: 'advanced-table',
        name: 'FgAdvancedTable',
        label: opts.title,
        position: { x: 24, y: 72, w: 1392, h: 780, zIndex: 2 },
        style: { width: '100%', height: '780px' },
        props: {
          columns: opts.columns,
          toolbar: apply ? [{ key: 'add', label: '新建', type: 'primary', icon: 'plus' }] : [],
          stripe: true,
          border: true,
          height: 680,
          pagination: { enabled: true, pageSize: 20, pageSizes: [10, 20, 50] },
          selection: { enabled: false },
        },
        api: apply
          ? { url: `/submissions/${apply.formSchemaId}`, method: 'get', dataPath: 'items', immediate: true }
          : undefined,
        options: [],
        variables: [],
        events,
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 900),
  }
}

export interface FormPageOptions {
  title: string
  formId?: string
  fields: Array<Record<string, unknown>>
  submitSchemaCode: string
  refs: BusinessSchemaRefs
}

export function buildApplyFormPage(opts: FormPageOptions): Record<string, unknown> {
  const schema = opts.refs.schemas[opts.submitSchemaCode]
  const formId = opts.formId ?? 'form_main'
  const yStart = 72
  const widgets: Array<Record<string, unknown>> = [titleWidget('form-title', opts.title)]

  opts.fields.forEach((field, idx) => {
    widgets.push({
      id: `field-${field.field}`,
      type: field.type ?? 'input',
      name: field.name ?? 'FgInput',
      label: field.label,
      field: field.field,
      formId,
      position: { x: 24, y: yStart + idx * 56, w: 680, h: 48, zIndex: 2 + idx },
      style: { width: '100%' },
      props: field.props ?? { placeholder: field.label },
      api: field.api,
      options: field.options ?? [],
      variables: [],
      events: [],
      rules: field.rules ?? [],
      validationRules: field.validationRules ?? [],
    })
  })

  widgets.push({
    id: 'btn-submit',
    type: 'button',
    name: 'FgButton',
    label: '提交',
    position: { x: 24, y: yStart + opts.fields.length * 56 + 24, w: 120, h: 40, zIndex: 99 },
    style: {},
    props: { text: '提交', type: 'primary' },
    options: [],
    variables: [],
    events: [{
      trigger: 'click',
      actions: [{
        type: 'submitSubmission',
        schemaId: schema?.formSchemaId,
        validateFormId: formId,
      }],
    }],
    rules: [],
    validationRules: [],
  })

  return { widgets, board: makeBoard(960, Math.max(600, yStart + opts.fields.length * 56 + 120)) }
}

export function buildStatsDashboardPage(title: string, apiPath: string): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('stats-title', title),
      {
        id: 'stats-kpi-1',
        type: 'statistic',
        name: 'FgStatistic',
        label: '总量',
        position: { x: 24, y: 72, w: 300, h: 120, zIndex: 2 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: { title: '总量', value: 0, apiUrl: apiPath, responseDataPath: 'total' },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
      {
        id: 'stats-bar',
        type: 'bar-chart',
        name: 'FgBarChart',
        label: '趋势',
        position: { x: 24, y: 210, w: 920, h: 360, zIndex: 3 },
        style: { backgroundColor: '#fff', borderRadius: '8px', padding: '16px' },
        props: {
          title: '趋势',
          staticData: [{ category: '1月', value: 10 }, { category: '2月', value: 14 }],
          xField: 'category',
          yField: 'value',
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

export function buildPlaceholderPage(title: string, note: string): Record<string, unknown> {
  return {
    widgets: [
      titleWidget('ph-title', title),
      {
        id: 'ph-banner',
        type: 'banner',
        name: 'FgBanner',
        label: '说明',
        position: { x: 24, y: 72, w: 1392, h: 80, zIndex: 2 },
        style: { width: '100%' },
        props: { title: note, type: 'info', closable: false },
        options: [],
        variables: [],
        events: [],
        rules: [],
        validationRules: [],
      },
    ],
    board: makeBoard(1440, 720),
  }
}

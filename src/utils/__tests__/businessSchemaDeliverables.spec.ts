import { describe, it, expect } from 'vitest'
import {
  buildDeliverableSchemaJson,
  DELIVERABLE_SCHEMA_CODES,
  type BusinessSchemaRefs,
} from '../businessSchemaDeliverables.js'
import { EXTENDED_DELIVERABLE_CODES } from '../business-deliverables/modules/extended.js'

const CORE_CODES = [
  'dashboard-workbench',
  'hr-leave-apply',
  'hr-leave-list',
  'hr-leave-detail',
  'hr-leave-stats',
  'sys-user-mgmt',
  'sys-role-mgmt',
  'sys-dept-mgmt',
] as const

const mockRefs: BusinessSchemaRefs = {
  schemas: {
    'dashboard-workbench': { formSchemaId: 'mongo-wb', publishId: 'pub-wb' },
    'hr-leave-apply': { formSchemaId: 'mongo-apply', publishId: 'pub-apply' },
    'hr-leave-list': { formSchemaId: 'mongo-list', publishId: 'pub-list' },
    'hr-leave-detail': { formSchemaId: 'mongo-detail', publishId: 'pub-detail' },
    'hr-leave-stats': { formSchemaId: 'mongo-stats', publishId: 'pub-stats' },
  },
  leaveFlowDefinitionId: 'flow-leave-001',
}

function assertBoardShape(json: Record<string, unknown>) {
  expect(Array.isArray(json.widgets)).toBe(true)
  expect((json.widgets as unknown[]).length).toBeGreaterThan(0)
  const board = json.board as Record<string, unknown>
  expect(board).toBeDefined()
  expect(board.canvas).toBeDefined()
  expect(Array.isArray(board.variables)).toBe(true)
  expect(Array.isArray(board.events)).toBe(true)
}

describe('businessSchemaDeliverables', () => {
  it('exports core + extended deliverable codes', () => {
    expect(DELIVERABLE_SCHEMA_CODES.length).toBeGreaterThanOrEqual(128)
    for (const code of CORE_CODES) {
      expect(DELIVERABLE_SCHEMA_CODES).toContain(code)
    }
    for (const code of EXTENDED_DELIVERABLE_CODES) {
      expect(DELIVERABLE_SCHEMA_CODES).toContain(code)
    }
  })

  for (const code of DELIVERABLE_SCHEMA_CODES) {
    it(`${code} produces valid { widgets, board }`, () => {
      const json = buildDeliverableSchemaJson(code, mockRefs)
      assertBoardShape(json)
    })
  }

  it('hr-leave-apply has submitSubmission with schemaId (webhook starts flow)', () => {
    const json = buildDeliverableSchemaJson('hr-leave-apply', mockRefs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const submitBtn = widgets.find((w) => w.id === 'btn-submit')
    expect(submitBtn).toBeDefined()
    const events = submitBtn!.events as Array<{ actions: Array<Record<string, unknown>> }>
    const submitAction = events[0].actions.find((a) => a.type === 'submitSubmission')
    expect(submitAction).toBeDefined()
    expect(submitAction!.schemaId).toBe('mongo-apply')
    expect(submitAction!.definitionId).toBeUndefined()
  })

  it('hr-leave-list uses data.* column paths for submission fields', () => {
    const json = buildDeliverableSchemaJson('hr-leave-list', mockRefs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'crud-list-page')
    const columns = (page!.props as Record<string, unknown>).columns as Array<{ prop: string }>
    const props = columns.map((c) => c.prop)
    expect(props).toContain('data.leaveType')
    expect(props).toContain('data.days')
    expect(props).toContain('data.reason')
  })

  it('hr-leave-apply includes required form fields', () => {
    const json = buildDeliverableSchemaJson('hr-leave-apply', mockRefs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const fields = new Set(widgets.filter((w) => w.formId === 'form_main').map((w) => w.field))
    expect(fields).toEqual(
      new Set(['leaveType', 'startTime', 'endTime', 'days', 'reason', 'agentUser', 'attachments']),
    )
  })

  it('hr-leave-list wires crud-list-page API to apply schema submissions', () => {
    const json = buildDeliverableSchemaJson('hr-leave-list', mockRefs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'crud-list-page')
    expect(page).toBeDefined()
    const api = page!.api as Record<string, unknown>
    expect(api.url).toBe('/submissions/mongo-apply')
    expect(api.method).toBe('get')
    expect(api.dataPath).toBe('items')
  })

  it('hr-leave-stats includes statistic and charts with staticData', () => {
    const json = buildDeliverableSchemaJson('hr-leave-stats', mockRefs)
    const types = (json.widgets as Array<Record<string, unknown>>).map((w) => w.type)
    expect(types).toContain('statistic')
    expect(types).toContain('bar-chart')
    expect(types).toContain('line-chart')
  })

  it('report-exec-screen includes auto-refresh for KPI and chart targets', () => {
    const json = buildDeliverableSchemaJson('report-exec-screen', mockRefs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const refresher = widgets.find((w) => w.type === 'auto-refresh')
    expect(refresher).toBeDefined()
    const props = refresher!.props as Record<string, unknown>
    expect(String(props.targets)).toContain('exec-kpi-pending')
    expect(String(props.targets)).toContain('exec-trend')
    expect(props.intervalSeconds).toBe(30)
  })

  it('dashboard-workbench has KPI statistics and shortcut buttons', () => {
    const json = buildDeliverableSchemaJson('dashboard-workbench', mockRefs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const stats = widgets.filter((w) => w.type === 'statistic')
    const buttons = widgets.filter((w) => w.type === 'button')
    expect(stats.length).toBeGreaterThanOrEqual(3)
    expect(buttons.length).toBeGreaterThanOrEqual(3)
  })

  it('sys-user-mgmt uses user-management widget', () => {
    const json = buildDeliverableSchemaJson('sys-user-mgmt', mockRefs)
    const widget = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'user-management')
    expect(widget).toBeDefined()
  })

  it('sys-role-mgmt uses role-management widget', () => {
    const json = buildDeliverableSchemaJson('sys-role-mgmt', mockRefs)
    const widget = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'role-management')
    expect(widget).toBeDefined()
  })

  it('sys-dept-mgmt uses advanced-table with /depts API', () => {
    const json = buildDeliverableSchemaJson('sys-dept-mgmt', mockRefs)
    const table = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'advanced-table')
    expect(table).toBeDefined()
    expect((table!.api as Record<string, unknown>).url).toBe('/depts')
  })

  it('hr-leave-list uses crud-list-page with export and built-in detail dialog', () => {
    const json = buildDeliverableSchemaJson('hr-leave-list', mockRefs)
    const widgets = json.widgets as Record<string, unknown>[]
    const page = widgets.find((w) => w.id === 'leave-table') as Record<string, unknown>
    expect(page.type).toBe('crud-list-page')
    const props = page.props as Record<string, unknown>
    const toolbar = props.toolbar as Array<{ key: string }>
    expect(toolbar.some((b) => b.key === 'export')).toBe(true)
    const detailDialog = props.detailDialog as Record<string, unknown>
    expect(String(detailDialog.detailApiUrl)).toContain('/business/hr/leave/detail')
    expect(widgets.some((w) => w.id === 'leave-detail-dialog')).toBe(false)
  })

  it('hr-leave-stats charts bind live API paths', () => {
    const json = buildDeliverableSchemaJson('hr-leave-stats', mockRefs)
    const widgets = json.widgets as Array<{ id: string; props?: Record<string, unknown> }>
    const bar = widgets.find((w) => w.id === 'stats-bar-dept')
    expect(bar?.props?.apiUrl).toBe('/business/hr/leave/stats')
    expect(bar?.props?.responseDataPath).toBe('byDept')
    const pie = widgets.find((w) => w.id === 'stats-pie-type')
    expect(pie?.props?.responseDataPath).toBe('byLeaveType')
  })

  it('oa-trip-apply includes module-spec form fields', () => {
    const refs: BusinessSchemaRefs = {
      schemas: { 'oa-trip-apply': { formSchemaId: 'mongo-trip', publishId: 'pub-trip' } },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-trip-apply', refs)
    const fields = new Set(
      (json.widgets as Array<Record<string, unknown>>)
        .filter((w) => w.formId === 'form_main')
        .map((w) => w.field),
    )
    expect(fields).toEqual(
      new Set([
        'title', 'destination', 'region', 'startDate', 'endDate',
        'transport', 'budgetAmount', 'companions', 'reason', 'attachments',
      ]),
    )
  })

  it('oa-trip-list uses E-45 crud-list-page with export and domain detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'oa-trip-apply': { formSchemaId: 'mongo-trip', publishId: 'pub-trip' },
        'oa-trip-detail': { formSchemaId: 'mongo-trip-detail', publishId: 'pub-trip-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-trip-list', refs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const page = widgets.find((w) => w.id === 'trip-table') as Record<string, unknown>
    expect(page.type).toBe('crud-list-page')
    const props = page.props as Record<string, unknown>
    const toolbar = props.toolbar as Array<{ key: string }>
    expect(toolbar.some((b) => b.key === 'export')).toBe(true)
    const detailDialog = props.detailDialog as Record<string, unknown>
    expect(String(detailDialog.detailApiUrl)).toContain('/business/oa/trip/detail')
    expect(widgets.some((w) => w.id === 'trip-detail-dialog')).toBe(false)
  })

  it('oa-trip-detail dataSource includes recordId variable placeholder', () => {
    const json = buildDeliverableSchemaJson('oa-trip-detail', mockRefs)
    const desc = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'trip-detail-desc')
    const url = ((desc!.props as Record<string, unknown>).dataSource as Record<string, unknown>).url
    expect(url).toContain('{{variables.recordId}}')
    expect((json.widgets as Array<Record<string, unknown>>).some((w) => w.type === 'flow-task-actions')).toBe(true)
  })

  it('oa-trip-apply uses P-02 submit with list navigate', () => {
    const refs: BusinessSchemaRefs = {
      schemas: { 'oa-trip-apply': { formSchemaId: 'mongo-trip', publishId: 'pub-trip' } },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-trip-apply', refs)
    const submit = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'btn-submit')
    const actions = ((submit!.events as Array<Record<string, unknown>>)[0].actions as Array<Record<string, unknown>>)
    expect(actions.some((a) => a.type === 'submitSubmission')).toBe(true)
    expect(actions.some((a) => a.type === 'navigate')).toBe(true)
  })

  it('oa-seal-list uses crud-list-page with seal detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'oa-seal-apply': { formSchemaId: 'mongo-seal', publishId: 'pub-seal' },
        'oa-seal-detail': { formSchemaId: 'mongo-seal-detail', publishId: 'pub-seal-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-seal-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'seal-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/oa/seal/detail')
  })

  it('fin-expense-list uses crud-list-page with domain detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-expense-apply': { formSchemaId: 'mongo-expense', publishId: 'pub-expense' },
        'fin-expense-detail': { formSchemaId: 'mongo-expense-detail', publishId: 'pub-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-expense-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'expense-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/fin/expense/detail')
  })

  it('hr-overtime-list uses crud-list-page with overtime detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'hr-overtime-apply': { formSchemaId: 'mongo-ot', publishId: 'pub-ot' },
        'hr-overtime-detail': { formSchemaId: 'mongo-ot-detail', publishId: 'pub-ot-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('hr-overtime-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'overtime-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/hr/overtime/detail')
  })

  it('fin-purchase-list uses crud-list-page with purchase detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-purchase-apply': { formSchemaId: 'mongo-pur', publishId: 'pub-pur' },
        'fin-purchase-detail': { formSchemaId: 'mongo-pur-detail', publishId: 'pub-pur-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-purchase-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'purchase-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/fin/purchase/detail')
  })

  it('fin-payment-list uses crud-list-page with payment detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-payment-apply': { formSchemaId: 'mongo-pay', publishId: 'pub-pay' },
        'fin-payment-detail': { formSchemaId: 'mongo-pay-detail', publishId: 'pub-pay-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-payment-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'payment-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/fin/payment/detail')
  })

  it('fin-payment-apply uses flow submission apply page', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-payment-apply': { formSchemaId: 'mongo-pay', publishId: 'pub-pay' },
        'fin-payment-list': { formSchemaId: 'mongo-pay-list', publishId: 'pub-pay-list' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-payment-apply', refs)
    const submit = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'btn-submit')
    const actions = (((submit!.events as Array<Record<string, unknown>>)[0]).actions as Array<Record<string, unknown>>)
    expect(actions.some((a) => a.type === 'submitSubmission')).toBe(true)
    expect(actions.some((a) => a.type === 'navigate')).toBe(true)
  })

  it('hr-onboard-list uses crud-list-page with onboard detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'hr-onboard-apply': { formSchemaId: 'mongo-ob', publishId: 'pub-ob' },
        'hr-onboard-detail': { formSchemaId: 'mongo-ob-detail', publishId: 'pub-ob-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('hr-onboard-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'onboard-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/hr/onboard/detail')
  })

  it('gov-case-list uses crud-list-page with gov case detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'gov-case-apply': { formSchemaId: 'mongo-gov', publishId: 'pub-gov' },
        'gov-case-detail': { formSchemaId: 'mongo-gov-detail', publishId: 'pub-gov-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('gov-case-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'gov-case-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/gov/case/detail')
  })

  it('gov-case-detail uses domain detail API not generic submission view', () => {
    const json = buildDeliverableSchemaJson('gov-case-detail', {
      schemas: { 'gov-case-detail': { formSchemaId: 'mongo-gov-detail', publishId: 'pub-gov-detail' } },
      leaveFlowDefinitionId: null,
    })
    const desc = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'gov-case-desc')
    const url = (((desc!.props as Record<string, unknown>).dataSource as Record<string, unknown>).url as string)
    expect(url).toContain('/business/gov/case/detail')
    expect(url).not.toContain('/submissions/record')
  })

  it('hr-resign-list uses crud-list-page with resign detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'hr-resign-apply': { formSchemaId: 'mongo-rs', publishId: 'pub-rs' },
        'hr-resign-detail': { formSchemaId: 'mongo-rs-detail', publishId: 'pub-rs-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('hr-resign-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'resign-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/hr/resign/detail')
  })

  it('hr-recruit-list uses crud-list-page with recruit detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'hr-recruit-apply': { formSchemaId: 'mongo-rc', publishId: 'pub-rc' },
        'hr-recruit-detail': { formSchemaId: 'mongo-rc-detail', publishId: 'pub-rc-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('hr-recruit-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'recruit-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/hr/recruit/detail')
  })

  it('gov-license-list uses crud-list-page with license detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'gov-license-apply': { formSchemaId: 'mongo-lic', publishId: 'pub-lic' },
        'gov-license-detail': { formSchemaId: 'mongo-lic-detail', publishId: 'pub-lic-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('gov-license-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'gov-license-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/gov/license/detail')
  })

  it('oa-meeting-list uses crud-list-page with meeting detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'oa-meeting-book': { formSchemaId: 'mongo-mt', publishId: 'pub-mt' },
        'oa-meeting-detail': { formSchemaId: 'mongo-mt-detail', publishId: 'pub-mt-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-meeting-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'meeting-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/oa/meeting/detail')
  })

  it('oa-meeting-book retains calendar widget', () => {
    const json = buildDeliverableSchemaJson('oa-meeting-book', {
      schemas: { 'oa-meeting-book': { formSchemaId: 'mongo-mt', publishId: 'pub-mt' } },
      leaveFlowDefinitionId: null,
    })
    const calendar = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'meeting-calendar')
    expect(calendar?.type).toBe('calendar')
  })

  it('oa-asset-list uses crud-list-page with asset detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'oa-asset-apply': { formSchemaId: 'mongo-as', publishId: 'pub-as' },
        'oa-asset-detail': { formSchemaId: 'mongo-as-detail', publishId: 'pub-as-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('oa-asset-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'asset-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/oa/asset/detail')
  })

  it('fin-invoice-list uses crud-list-page with invoice detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-invoice-register': { formSchemaId: 'mongo-inv', publishId: 'pub-inv' },
        'fin-invoice-detail': { formSchemaId: 'mongo-inv-detail', publishId: 'pub-inv-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-invoice-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'invoice-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/fin/invoice/detail')
  })

  it('fin-budget-list uses crud-list-page with budget detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'fin-budget-edit': { formSchemaId: 'mongo-bud', publishId: 'pub-bud' },
        'fin-budget-detail': { formSchemaId: 'mongo-bud-detail', publishId: 'pub-bud-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('fin-budget-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'budget-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/fin/budget/detail')
  })

  it('equip-requisition-list uses crud-list-page with requisition detail API', () => {
    const refs: BusinessSchemaRefs = {
      schemas: {
        'equip-requisition-apply': { formSchemaId: 'mongo-eq', publishId: 'pub-eq' },
        'equip-requisition-detail': { formSchemaId: 'mongo-eq-detail', publishId: 'pub-eq-detail' },
      },
      leaveFlowDefinitionId: null,
    }
    const json = buildDeliverableSchemaJson('equip-requisition-list', refs)
    const page = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'equip-requisition-table')
    expect(page?.type).toBe('crud-list-page')
    const detailDialog = ((page!.props as Record<string, unknown>).detailDialog as Record<string, unknown>)
    expect(String(detailDialog.detailApiUrl)).toContain('/business/equip/requisition/detail')
  })

  it('audit-issue-list uses advanced-table with domain issues API', () => {
    const json = buildDeliverableSchemaJson('audit-issue-list', { schemas: {}, leaveFlowDefinitionId: null })
    const table = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'audit-issue-table')
    expect(table?.type).toBe('advanced-table')
    expect(((table!.api as Record<string, unknown>).url as string)).toContain('/audit/issues')
  })

  it('audit-issue-detail uses business audit issue detail API', () => {
    const json = buildDeliverableSchemaJson('audit-issue-detail', {
      schemas: { 'audit-issue-detail': { formSchemaId: 'mongo-audit', publishId: 'pub-audit' } },
      leaveFlowDefinitionId: null,
    })
    const desc = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'issue-desc')
    const url = (((desc!.props as Record<string, unknown>).dataSource as Record<string, unknown>).url as string)
    expect(url).toContain('/business/audit/issue/detail')
  })

  it('hr-leave-detail dataSource includes recordId variable placeholder', () => {
    const json = buildDeliverableSchemaJson('hr-leave-detail', mockRefs)
    const desc = (json.widgets as Array<Record<string, unknown>>).find((w) => w.id === 'detail-desc')
    const url = ((desc!.props as Record<string, unknown>).dataSource as Record<string, unknown>).url
    expect(url).toContain('{{variables.recordId}}')
  })
})

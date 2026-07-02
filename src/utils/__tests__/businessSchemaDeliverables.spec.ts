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
    expect(DELIVERABLE_SCHEMA_CODES.length).toBeGreaterThanOrEqual(80)
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
    const table = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'advanced-table')
    const columns = (table!.props as Record<string, unknown>).columns as Array<{ prop: string }>
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

  it('hr-leave-list wires advanced-table API to apply schema submissions', () => {
    const json = buildDeliverableSchemaJson('hr-leave-list', mockRefs)
    const table = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'advanced-table')
    expect(table).toBeDefined()
    const api = table!.api as Record<string, unknown>
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

  it('hr-leave-detail dataSource includes recordId variable placeholder', () => {
    const json = buildDeliverableSchemaJson('hr-leave-detail', mockRefs)
    const desc = (json.widgets as Array<Record<string, unknown>>).find((w) => w.type === 'descriptions')
    const url = ((desc!.props as Record<string, unknown>).dataSource as Record<string, unknown>).url
    expect(url).toContain('{{variables.recordId}}')
  })
})

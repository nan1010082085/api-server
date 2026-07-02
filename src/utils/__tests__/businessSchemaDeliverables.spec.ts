import { describe, it, expect } from 'vitest'
import {
  buildDeliverableSchemaJson,
  DELIVERABLE_SCHEMA_CODES,
  type BusinessSchemaRefs,
} from '../businessSchemaDeliverables.js'

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
  it('exports all D1 deliverable codes', () => {
    expect(DELIVERABLE_SCHEMA_CODES).toEqual([
      'dashboard-workbench',
      'hr-leave-apply',
      'hr-leave-list',
      'hr-leave-detail',
      'hr-leave-stats',
    ])
  })

  for (const code of DELIVERABLE_SCHEMA_CODES) {
    it(`${code} produces valid { widgets, board }`, () => {
      const json = buildDeliverableSchemaJson(code, mockRefs)
      assertBoardShape(json)
    })
  }

  it('hr-leave-apply has submitSubmission with schemaId and flow binding', () => {
    const json = buildDeliverableSchemaJson('hr-leave-apply', mockRefs)
    const widgets = json.widgets as Array<Record<string, unknown>>
    const submitBtn = widgets.find((w) => w.id === 'btn-submit')
    expect(submitBtn).toBeDefined()
    const events = submitBtn!.events as Array<{ actions: Array<Record<string, unknown>> }>
    const submitAction = events[0].actions.find((a) => a.type === 'submitSubmission')
    expect(submitAction).toBeDefined()
    expect(submitAction!.schemaId).toBe('mongo-apply')
    expect(submitAction!.definitionId).toBe('flow-leave-001')
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
})

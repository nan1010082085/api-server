import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindLean = vi.fn()
const mockSchemaLean = vi.fn()

vi.mock('../../../models/FormSubmission.js', () => ({
  FormSubmissionModel: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn(() => mockFindLean()),
      })),
    })),
  },
}))

vi.mock('../../../models/FormSchema.js', () => ({
  FormSchemaModel: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn(() => mockSchemaLean()),
      })),
    })),
  },
}))

import { getReportAggregate } from '../reportAggregateService.js'

describe('reportAggregateService (S-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSchemaLean.mockResolvedValue([
      { _id: 's-leave', code: 'hr-leave-apply' },
      { _id: 's-expense', code: 'fin-expense-apply' },
    ])
  })

  it('returns empty rows when no schemas seeded', async () => {
    mockSchemaLean.mockResolvedValueOnce([])
    const result = await getReportAggregate('hr')
    expect(result.totalSubmissions).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('aggregates submissions by schema code for finance module', async () => {
    mockSchemaLean.mockResolvedValueOnce([{ _id: 's-expense', code: 'fin-expense-apply' }])
    mockFindLean.mockResolvedValueOnce([
      { schemaId: 's-expense', status: 'submitted', data: { totalAmount: 500 } },
      { schemaId: 's-expense', status: 'approved', data: { totalAmount: 1200 } },
    ])
    const result = await getReportAggregate('finance')
    expect(result.totalSubmissions).toBe(2)
    const expense = result.rows.find((r) => r.schemaCode === 'fin-expense-apply')
    expect(expense?.pending).toBe(1)
    expect(expense?.approved).toBe(1)
    expect(expense?.amount).toBe(1700)
  })
})

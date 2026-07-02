import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindLean = vi.fn()
const mockCount = vi.fn()
const mockSchemaLean = vi.fn()

vi.mock('../../../models/FormSubmission.js', () => ({
  FormSubmissionModel: {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        skip: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: vi.fn(() => mockFindLean()),
          })),
        })),
      })),
      lean: vi.fn(() => mockFindLean()),
    })),
    countDocuments: (...args: unknown[]) => mockCount(...args),
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

import { getFinMonthlyClose, getFinLedgerBalance } from '../finFinanceReportService.js'

describe('finFinanceReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSchemaLean.mockResolvedValue([
      { _id: 'schema-expense', code: 'fin-expense-apply' },
      { _id: 'schema-budget', code: 'fin-budget-edit' },
    ])
  })

  it('getFinMonthlyClose returns empty when no schemas', async () => {
    mockSchemaLean.mockResolvedValueOnce([])
    const result = await getFinMonthlyClose()
    expect(result.total).toBe(0)
    expect(result.items).toEqual([])
  })

  it('getFinMonthlyClose maps finance submissions with module label', async () => {
    mockCount.mockResolvedValueOnce(2).mockResolvedValueOnce(5)
    mockFindLean.mockResolvedValueOnce([
      {
        _id: 'sub1',
        schemaId: 'schema-expense',
        status: 'submitted',
        createdAt: new Date('2026-07-01'),
        data: { title: '差旅报销', totalAmount: 1200 },
      },
    ])
    const result = await getFinMonthlyClose({ page: 1, pageSize: 20 })
    expect(result.total).toBe(2)
    expect(result.totalItems).toBe(5)
    expect(result.items[0].module).toBe('报销')
    expect(result.items[0].amount).toBe(1200)
  })

  it('getFinLedgerBalance aggregates budget and actual by subject', async () => {
    mockFindLean.mockResolvedValueOnce([
      {
        _id: 'b1',
        schemaId: 'schema-budget',
        status: 'approved',
        createdAt: new Date(),
        data: { subject: '办公费', budgetAmount: 10000 },
      },
      {
        _id: 'e1',
        schemaId: 'schema-expense',
        status: 'approved',
        createdAt: new Date(),
        data: { department: '办公费', totalAmount: 3000 },
      },
    ])
    const result = await getFinLedgerBalance()
    expect(result.total).toBe(1)
    expect(result.items[0].subject).toBe('办公费')
    expect(result.items[0].budgetAmount).toBe(10000)
    expect(result.items[0].actualAmount).toBe(3000)
    expect(result.items[0].balance).toBe(7000)
  })
})

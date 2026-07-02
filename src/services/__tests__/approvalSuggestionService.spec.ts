import { describe, it, expect } from 'vitest'
import { buildApprovalSuggestion } from '../approvalSuggestionService.js'

describe('approvalSuggestionService', () => {
  it('suggests review for long leave', async () => {
    const result = await buildApprovalSuggestion({
      formData: { leaveType: 'annual', days: 12, reason: 'travel' },
    })
    expect(result.recommendedAction).toBe('review')
    expect(result.suggestion).toContain('10')
  })

  it('suggests reject when reason empty', async () => {
    const result = await buildApprovalSuggestion({
      formData: { leaveType: 'personal', days: 1, reason: '' },
    })
    expect(result.recommendedAction).toBe('reject')
  })

  it('suggests approve for normal leave', async () => {
    const result = await buildApprovalSuggestion({
      formData: { leaveType: 'annual', days: 3, reason: '家庭事务' },
    })
    expect(result.recommendedAction).toBe('approve')
  })
})

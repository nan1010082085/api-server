import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../flow-models/TaskInstance.js', () => ({
  TaskInstanceModel: { countDocuments: vi.fn().mockResolvedValue(2) },
}))
vi.mock('../../models/FormSubmission.js', () => ({
  FormSubmissionModel: { countDocuments: vi.fn().mockResolvedValue(5) },
}))
vi.mock('../../models/Notice.js', () => ({
  NoticeModel: { countDocuments: vi.fn().mockResolvedValue(3) },
}))

import { buildDailyDigest } from '../dailyDigestService.js'

describe('dailyDigestService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns structured digest with highlights', async () => {
    const digest = await buildDailyDigest('000000')
    expect(digest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(digest.pendingTasks).toBe(2)
    expect(digest.todaySubmissions).toBe(5)
    expect(digest.publishedNotices).toBe(3)
    expect(digest.highlights.some((h) => h.includes('待办'))).toBe(true)
  })
})

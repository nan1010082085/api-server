import { describe, it, expect } from 'vitest'
import {
  normalizeConversationTurns,
  trimConversationTurns,
  extractAssistantContent,
} from '../services/agentWorkflowConversation.js'

describe('agentWorkflowConversation', () => {
  it('normalizes conversation turns', () => {
    const turns = normalizeConversationTurns([
      { role: 'user', content: ' hi ' },
      { role: 'invalid', content: 'x' },
      { role: 'assistant', content: 'ok' },
    ])
    expect(turns).toHaveLength(2)
    expect(turns[0]?.content).toBe('hi')
  })

  it('trims history to max turns', () => {
    const turns = trimConversationTurns(
      [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
      ],
      2,
    )
    expect(turns).toHaveLength(2)
    expect(turns[0]?.content).toBe('2')
  })

  it('extracts assistant content from llm output', () => {
    expect(extractAssistantContent({ text: 'answer' })).toBe('answer')
  })
})

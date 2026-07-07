/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { slugifyWorkflowName, isValidWorkflowSlug } from '../utils/workflowSlug.js'

describe('workflowSlug', () => {
  it('slugifyWorkflowName normalizes spaces and case', () => {
    expect(slugifyWorkflowName('Document Parse')).toBe('document-parse')
    expect(slugifyWorkflowName('  Hello_World  ')).toBe('hello-world')
  })

  it('isValidWorkflowSlug accepts kebab-case identifiers', () => {
    expect(isValidWorkflowSlug('document-parse')).toBe(true)
    expect(isValidWorkflowSlug('a')).toBe(true)
    expect(isValidWorkflowSlug('-bad')).toBe(false)
    expect(isValidWorkflowSlug('Bad_Slug')).toBe(false)
  })
})

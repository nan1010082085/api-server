import { describe, it, expect } from 'vitest'
import { isValidObjectId, toObjectId, refId } from '../objectId.js'

describe('objectId utils', () => {
  it('validates strict 24-char hex ObjectId', () => {
    expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true)
    expect(isValidObjectId('draft')).toBe(false)
    expect(isValidObjectId('undefined')).toBe(false)
    expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false)
  })

  it('toObjectId throws on invalid id', () => {
    expect(() => toObjectId('draft')).toThrow(/Invalid ObjectId/)
    expect(String(toObjectId('507f1f77bcf86cd799439011'))).toBe('507f1f77bcf86cd799439011')
  })

  it('refId returns null for empty refs', () => {
    expect(refId(null)).toBeNull()
    expect(refId(undefined)).toBeNull()
    expect(refId('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011')
  })
})

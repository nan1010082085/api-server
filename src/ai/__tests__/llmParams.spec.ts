/**
 * LLM 参数健壮性测试。
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { extractJsonFromResponse } from '../graph/agentBase.js'

describe('extractJsonFromResponse', () => {
  it('parses JSON inside ```json code blocks', () => {
    const raw = '思考过程...\n```json\n{"target": "editor"}\n```'
    expect(extractJsonFromResponse(raw)).toEqual({ target: 'editor' })
  })

  it('parses JSON inside plain ``` code blocks', () => {
    const raw = '```\n{"intent": "generate"}\n```'
    expect(extractJsonFromResponse(raw)).toEqual({ intent: 'generate' })
  })

  it('parses bare JSON object', () => {
    expect(extractJsonFromResponse('{"a": 1}')).toEqual({ a: 1 })
  })

  it('parses JSON with surrounding text', () => {
    const raw = 'Let me analyze.\n{"target": "flow", "confidence": 0.9}\nDone.'
    expect(extractJsonFromResponse(raw)).toEqual({ target: 'flow', confidence: 0.9 })
  })

  it('handles nested objects', () => {
    const raw = '{"outer": {"inner": "value"}}'
    expect(extractJsonFromResponse(raw)).toEqual({ outer: { inner: 'value' } })
  })

  it('handles strings containing braces', () => {
    const raw = '{"text": "this {looks like} braces"}'
    expect(extractJsonFromResponse(raw)).toEqual({ text: 'this {looks like} braces' })
  })

  it('handles escaped quotes in strings', () => {
    const raw: string = '{"msg": "say \\"hi\\""}'
    expect(extractJsonFromResponse(raw)).toEqual({ msg: 'say "hi"' })
  })

  it('rejects incomplete JSON', () => {
    expect(extractJsonFromResponse('{"target": "editor"')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(extractJsonFromResponse('')).toBeNull()
  })

  it('rejects non-object input', () => {
    expect(extractJsonFromResponse('not json at all')).toBeNull()
  })

  it('returns null when no braces present', () => {
    expect(extractJsonFromResponse('plain text without json')).toBeNull()
  })

  it('parses code block with trailing content', () => {
    const raw = '```json\n{"x": 1}\n```\nSome trailing explanation.'
    expect(extractJsonFromResponse(raw)).toEqual({ x: 1 })
  })
})

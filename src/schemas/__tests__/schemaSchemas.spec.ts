/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { createSchemaSchema, updateSchemaSchema, importSchemaSchema } from '../schemaSchemas.js'

describe('createSchemaSchema', () => {
  it('accepts json as widget array', () => {
    const result = createSchemaSchema.safeParse({
      name: 'array-schema',
      type: 'form',
      json: [{ id: 'w1', type: 'title' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts json as { widgets, board }', () => {
    const result = createSchemaSchema.safeParse({
      name: 'board-schema',
      type: 'form',
      json: {
        widgets: [{ id: 'w1', type: 'title' }],
        board: {
          canvas: { layoutMode: 'flex', width: 1200, height: 800 },
          variables: [],
          events: [],
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts json as { widgets } without board', () => {
    const result = createSchemaSchema.safeParse({
      name: 'widgets-only',
      json: { widgets: [] },
    })
    expect(result.success).toBe(true)
  })

  it('rejects object json without widgets', () => {
    const result = createSchemaSchema.safeParse({
      name: 'bad-object',
      json: { board: { canvas: {} } },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = createSchemaSchema.safeParse({
      name: '',
      json: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('updateSchemaSchema', () => {
  it('accepts { widgets, board } json', () => {
    const result = updateSchemaSchema.safeParse({
      json: {
        widgets: [{ id: 'a', type: 'input' }],
        board: { canvas: { layoutMode: 'free' } },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty body', () => {
    const result = updateSchemaSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('importSchemaSchema', () => {
  it('still requires json array only', () => {
    const ok = importSchemaSchema.safeParse({
      name: 'import-ok',
      json: [{ id: 'w1', type: 'title' }],
    })
    expect(ok.success).toBe(true)

    const bad = importSchemaSchema.safeParse({
      name: 'import-bad',
      json: { widgets: [] },
    })
    expect(bad.success).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { isKnownBuiltinMcp, resolveBuiltinMcpFactory } from '../mcp/builtinFactories.js'

describe('mcp builtinFactories', () => {
  it('recognizes platform builtin keys', () => {
    expect(isKnownBuiltinMcp('schema')).toBe(true)
    expect(isKnownBuiltinMcp('flow')).toBe(true)
    expect(isKnownBuiltinMcp('unknown')).toBe(false)
  })

  it('resolves inmemory factory for schema', async () => {
    const factory = await resolveBuiltinMcpFactory('schema')
    expect(factory).toBeTypeOf('function')
    const server = factory!()
    expect(server).toBeTruthy()
  })
})

import { describe, it, expect } from 'vitest'
import { getNestedValue, resolveWorkflowTemplate } from '../services/agentWorkflowTemplateResolver.js'

describe('agentWorkflowTemplateResolver', () => {
  const ctx = {
    input: { message: 'hello', nested: { id: 'doc-1' } },
    lastOutput: { status: 'ok' },
    nodeOutputs: {
      'parse-1': {
        filename: 'invoice.pdf',
        text: '正文内容',
        extractionMethod: 'pdf',
      },
    },
  }

  it('resolves $input dotted paths', () => {
    expect(resolveWorkflowTemplate('{{$input.nested.id}}', ctx)).toBe('doc-1')
  })

  it('resolves $node field paths', () => {
    const out = resolveWorkflowTemplate(
      '文件：{{$node.parse-1.filename}}\n{{$node.parse-1.text}}',
      ctx,
    )
    expect(out).toContain('invoice.pdf')
    expect(out).toContain('正文内容')
  })

  it('resolves full $node output when no field path', () => {
    const out = resolveWorkflowTemplate('{{$node.parse-1}}', ctx)
    expect(out).toContain('"filename":"invoice.pdf"')
  })

  it('getNestedValue returns undefined for missing path', () => {
    expect(getNestedValue(ctx.nodeOutputs['parse-1'], 'missing')).toBeUndefined()
  })

  it('resolves $conversation template', () => {
    const out = resolveWorkflowTemplate('历史：{{$conversation}}', {
      ...ctx,
      conversationHistory: [{ role: 'user', content: '你好' }],
    })
    expect(out).toContain('用户：你好')
  })
})

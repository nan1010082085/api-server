export interface WorkflowTemplateContext {
  input: Record<string, unknown>
  lastOutput: unknown
  nodeOutputs: Record<string, unknown>
  conversationHistory?: Array<{ role: string; content: string }>
}

function formatTemplateValue(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return JSON.stringify(val)
}

export function getNestedValue(source: unknown, path: string): unknown {
  if (!path.trim()) return source
  let current: unknown = source
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

export function resolveWorkflowTemplate(text: string, ctx: WorkflowTemplateContext): string {
  const conversationText =
    ctx.conversationHistory?.length
      ? ctx.conversationHistory
          .map((t) => {
            const label = t.role === 'user' ? '用户' : t.role === 'assistant' ? '助手' : '系统'
            return `${label}：${t.content}`
          })
          .join('\n')
      : '（无历史对话）'

  return text
    .replace(/\{\{\$input\.([\w.]+)\}\}/g, (_, key: string) => {
      const val = getNestedValue(ctx.input, key)
      return formatTemplateValue(val)
    })
    .replace(/\{\{\$json\}\}/g, () => formatTemplateValue(ctx.lastOutput ?? {}))
    .replace(/\{\{\$conversation\}\}/g, () => conversationText)
    .replace(/\{\{\$node\.([\w-]+)(?:\.([\w.]+))?\}\}/g, (_, nodeId: string, fieldPath?: string) => {
      const nodeOutput = ctx.nodeOutputs[nodeId]
      if (fieldPath) {
        return formatTemplateValue(getNestedValue(nodeOutput, fieldPath))
      }
      return formatTemplateValue(nodeOutput)
    })
}

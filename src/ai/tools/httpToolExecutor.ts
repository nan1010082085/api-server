/**
 * Registry `kind: http` 工具统一执行器 — Chat LangGraph 与 Workflow DAG 共用。
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

export interface HttpRequestArgs {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
}

export interface HttpRequestOutput {
  status: number
  data: unknown
}

export async function executeHttpRequest(
  args: HttpRequestArgs,
): Promise<{ output: HttpRequestOutput; error?: string }> {
  try {
    const method = String(args.method ?? 'GET').toUpperCase()
    const url = String(args.url ?? '').trim()
    if (!url) {
      return { output: { status: 0, data: null }, error: 'url is required' }
    }
    const headers = args.headers ?? {}
    const body = args.body != null ? JSON.stringify(args.body) : undefined
    const res = await fetch(url, { method, headers, body })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      /* keep text */
    }
    const output = { status: res.status, data: parsed }
    if (!res.ok) {
      const msg = typeof parsed === 'string' ? parsed : `HTTP ${res.status}`
      return { output, error: msg }
    }
    return { output }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { output: { status: 0, data: { error: msg } }, error: msg }
  }
}

const httpRequestSchema = z.object({
  method: z.string().optional().describe('HTTP method, default GET'),
  url: z.string().describe('Request URL'),
  headers: z.record(z.string()).optional().describe('Request headers'),
  body: z.unknown().optional().describe('JSON request body'),
})

export function buildHttpStructuredTool(name: string, description?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: description ?? 'Send an HTTP request and return status with parsed response body',
    schema: httpRequestSchema,
    func: async (args) => {
      const result = await executeHttpRequest(args)
      return JSON.stringify(result.error ? { ...result.output, error: result.error } : result.output)
    },
  })
}

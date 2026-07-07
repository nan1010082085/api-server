/**
 * 插件包自定义 inmemory MCP 工厂 — 按 Registry 声明 dynamic import。
 */

import path from 'node:path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export type McpServerFactory = () => McpServer

const DEFAULT_EXPORT = 'createMcpServer'

export async function resolveCustomMcpFactory(
  modulePath: string,
  exportName = DEFAULT_EXPORT,
): Promise<McpServerFactory | null> {
  const trimmed = modulePath.trim()
  if (!trimmed) return null

  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed)

  const mod = await import(resolved) as Record<string, McpServerFactory | undefined>
  const factory = mod[exportName.trim() || DEFAULT_EXPORT]
  return typeof factory === 'function' ? factory : null
}

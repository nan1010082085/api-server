/**
 * 内置 MCP Server 工厂 — 仅此处映射 builtin 键到实现，供 bridge 按 Registry 声明加载。
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export type BuiltinMcpKey = 'schema' | 'flow' | 'widget' | 'rag' | 'industry'

type McpServerFactory = () => McpServer

const BUILTIN_LOADERS: Record<BuiltinMcpKey, () => Promise<{ default?: never } & Record<string, McpServerFactory>>> = {
  schema: () => import('./schemaServer.js'),
  flow: () => import('./flowServer.js'),
  widget: () => import('./widgetServer.js'),
  rag: () => import('./ragServer.js'),
  industry: () => import('./industryServer.js'),
}

const CREATE_FN: Record<BuiltinMcpKey, string> = {
  schema: 'createSchemaServer',
  flow: 'createFlowServer',
  widget: 'createWidgetServer',
  rag: 'createRagServer',
  industry: 'createIndustryServer',
}

export async function resolveBuiltinMcpFactory(builtin: string): Promise<McpServerFactory | null> {
  const key = builtin as BuiltinMcpKey
  const loader = BUILTIN_LOADERS[key]
  if (!loader) return null
  const mod = await loader()
  const fnName = CREATE_FN[key]
  const factory = mod[fnName] as McpServerFactory | undefined
  return factory ?? null
}

export function isKnownBuiltinMcp(builtin: string): builtin is BuiltinMcpKey {
  return builtin in BUILTIN_LOADERS
}

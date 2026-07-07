/**
 * MCP → LangGraph 桥接层。
 *
 * 使用 InMemoryTransport 将 MCP Server 的工具转换为 LangGraph StructuredTool。
 * 零网络开销，内存直连。Chat Agent 通过此桥接调用 MCP 工具，与外部 MCP 客户端
 * 共享同一份工具定义，实现「MCP 作为权威工具源」的架构目标。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredTool } from '@langchain/core/tools'
import { logger } from '../../utils/logger.js'
import { getPluginRegistry } from '../plugins/registrySingleton.js'
import { createMcpClient } from './createMcpClient.js'

// ────────────────────────────────────────────
// 工具转换
// ────────────────────────────────────────────

/**
 * 将 MCP Server 的工具列表转换为 LangGraph StructuredTool[]。
 *
 * MCP 工具返回 content 数组，此处提取 text 部分作为 LangGraph 工具的字符串返回。
 * 工具名保留 MCP 原名（含 `domain__` 前缀），确保全局唯一且与外部 MCP 客户端一致。
 */
async function convertMcpTools(client: Client): Promise<StructuredTool[]> {
  const { tools: mcpTools } = await client.listTools()

  return mcpTools.map((mcpTool) => {
    const zodSchema = mcpTool.inputSchema
      ? jsonSchemaToZod(mcpTool.inputSchema as Record<string, unknown>)
      : z.object({})

    return tool(
      async (params: Record<string, unknown>) => {
        try {
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: params,
          })
          const textContent = (result.content as Array<{ type: string; text: string }> | undefined)
            ?.filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n') ?? ''
          return textContent
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.error({ msg: '[mcpBridge] tool call failed', tool: mcpTool.name, error: message })
          // 返回结构化错误，而不是抛出——避免中断图执行，由上层 ToolNode 兜底处理
          return JSON.stringify({ success: false, error: `[${mcpTool.name}] ${message}`, recoverable: true })
        }
      },
      {
        name: mcpTool.name,
        description: mcpTool.description ?? '',
        schema: zodSchema,
      },
    )
  })
}

/**
 * 初始化插件中心声明的全部 MCP Server，返回 LangGraph 可用的工具数组。
 *
 * 从 Registry 读取 mcpServers；任一 server 失败不会中断整体，仅记录警告并跳过。
 */
export async function initMcpBridge(): Promise<StructuredTool[]> {
  const servers = getPluginRegistry()
    .listMcpServers()
    .filter((s) => s.enabled !== false)

  const results = await Promise.all(
    servers.map(async (decl) => {
      try {
        const client = await createMcpClient(decl)
        const tools = await convertMcpTools(client)
        logger.info({ msg: `[mcpBridge] ${decl.id} loaded ${tools.length} tools`, transport: decl.transport })
        return tools
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn({ msg: `[mcpBridge] ${decl.id} init failed, skipping`, transport: decl.transport, error: message })
        return [] as StructuredTool[]
      }
    }),
  )

  const allTools = results.flat()
  logger.info({ msg: `[mcpBridge] total ${allTools.length} MCP tools ready`, servers: servers.length })
  return allTools
}

// ────────────────────────────────────────────
// JSON Schema → Zod 转换器
// ────────────────────────────────────────────

/**
 * JSON Schema → Zod 转换器。
 *
 * 支持 object/string/number/integer/boolean/array/enum 常见类型，
 * 处理 required、description、default、enum 约束。
 * 不支持的 schema 降级为 z.unknown()，保证不阻塞工具注册。
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  // enum 约束（zod 的 enum 由 enum 字段触发，优先于 type）
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum as [string, ...string[]]
    let field: z.ZodType = z.enum(values)
    if (schema.description) field = field.describe(schema.description as string)
    return field
  }

  const type = schema.type as string | undefined

  if (type === 'object' && schema.properties) {
    const shape: Record<string, z.ZodType> = {}
    const required = (schema.required as string[]) ?? []

    for (const [key, prop] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
      let field = jsonSchemaToZod(prop as Record<string, unknown>)
      if (!required.includes(key)) {
        field = field.optional()
      }
      // default 转换为 .default()，让 LangGraph 能正确注入默认值
      if (prop.default !== undefined) {
        try {
          field = (field as z.ZodType).default(prop.default)
        } catch { /* 某些 zod 类型不支持 default，忽略 */ }
      }
      if (prop.description && !field.description) {
        field = field.describe(prop.description as string)
      }
      shape[key] = field
    }

    return z.object(shape)
  }

  if (type === 'string') {
    let field = z.string()
    if (schema.description) field = field.describe(schema.description as string)
    return field
  }
  if (type === 'number' || type === 'integer') {
    let field = z.number()
    if (type === 'integer') {
      field = field.int()
    }
    if (schema.description) field = field.describe(schema.description as string)
    return field
  }
  if (type === 'boolean') {
    let field = z.boolean()
    if (schema.description) field = field.describe(schema.description as string)
    return field
  }
  if (type === 'array') {
    if (schema.items) {
      const itemSchema = schema.items as Record<string, unknown>
      let field = z.array(jsonSchemaToZod(itemSchema))
      if (schema.description) field = field.describe(schema.description as string)
      return field
    }
    return z.array(z.unknown())
  }

  // 兜底：未知类型用 unknown，保证不阻塞注册
  return z.unknown()
}

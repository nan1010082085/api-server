/**
 * 最小 MCP stdio 服务 — 供 mcpBridgeTransport 集成测试使用。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'echo-fixture', version: '1.0.0' })

server.tool(
  'echo__ping',
  'Returns pong for connectivity checks',
  { message: z.string().optional().describe('Optional message') },
  async (params) => {
    const text = params.message ? `pong:${params.message}` : 'pong'
    return { content: [{ type: 'text' as const, text }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)

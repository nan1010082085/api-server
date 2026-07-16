/**
 * 自定义 MCP Server Factory 示例
 *
 * 展示如何创建一个自定义的 inmemory MCP Server。
 * 此文件会被 server/src/ai/mcp/bridge.ts 动态加载。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * 创建自定义 MCP Server
 *
 * @returns 配置好的 McpServer 实例
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'custom.example',
    version: '1.0.0',
  })

  // 注册一个简单的工具
  server.tool(
    'example__hello',
    '示例工具：返回问候语',
    {
      name: z.string().describe('用户名'),
    },
    async ({ name }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: `你好，${name}！这是来自自定义 MCP Server 的问候。`,
          },
        ],
      }
    },
  )

  // 注册一个资源
  server.resource(
    'example://info',
    'example://info',
    async () => ({
      contents: [
        {
          uri: 'example://info',
          text: '这是一个自定义 MCP Server 示例，展示了如何扩展 AI 平台的工具能力。',
        },
      ],
    }),
  )

  return server
}

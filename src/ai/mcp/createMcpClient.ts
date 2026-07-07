/**
 * 按插件中心 MCP 声明创建 Client（inmemory / stdio / sse）。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpServerDeclaration } from '../plugins/types.js'
import { resolveBuiltinMcpFactory } from './builtinFactories.js'
import { resolveCustomMcpFactory } from './customMcpFactory.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

async function createInternalClient(factory: () => McpServer): Promise<Client> {
  const server = factory()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: 'langgraph-internal', version: '1.0.0' })
  await client.connect(clientTransport)
  return client
}

export async function createMcpClient(decl: McpServerDeclaration): Promise<Client> {
  if (decl.transport === 'inmemory') {
    const factoryModule = decl.factoryModule?.trim()
    if (factoryModule) {
      const factory = await resolveCustomMcpFactory(factoryModule, decl.factoryExport)
      if (!factory) {
        throw new Error(
          `[mcpBridge] custom factory not found in "${factoryModule}" export "${decl.factoryExport ?? 'createMcpServer'}"`,
        )
      }
      return createInternalClient(factory)
    }

    const builtin = decl.builtin?.trim()
    if (!builtin) {
      throw new Error(`[mcpBridge] inmemory server ${decl.id} missing builtin or factoryModule`)
    }
    const factory = await resolveBuiltinMcpFactory(builtin)
    if (!factory) {
      throw new Error(`[mcpBridge] unknown builtin "${builtin}" for ${decl.id}`)
    }
    return createInternalClient(factory)
  }

  if (decl.transport === 'stdio') {
    if (!decl.command?.trim()) {
      throw new Error(`[mcpBridge] stdio server ${decl.id} missing command`)
    }
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({
      command: decl.command,
      args: decl.args ?? [],
    })
    const client = new Client({ name: `plugin-${decl.id}`, version: '1.0.0' })
    await client.connect(transport)
    return client
  }

  if (decl.transport === 'sse') {
    if (!decl.url?.trim()) {
      throw new Error(`[mcpBridge] sse server ${decl.id} missing url`)
    }
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
    const transport = new SSEClientTransport(new URL(decl.url), {
      requestInit: decl.headers ? { headers: decl.headers } : undefined,
    })
    const client = new Client({ name: `plugin-${decl.id}`, version: '1.0.0' })
    await client.connect(transport)
    return client
  }

  throw new Error(`[mcpBridge] unsupported transport for ${decl.id}`)
}

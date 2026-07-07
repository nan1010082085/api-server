/**
 * MCP bridge transport tests — stdio 真实子进程 + sse 校验与 mock。
 *
 * @vitest-environment node
 */

import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpClient } from '../mcp/createMcpClient.js'
import type { McpServerDeclaration } from '../plugins/types.js'

const fixtureServer = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/fixtures/mcp-echo-server.ts',
)

describe('createMcpClient transports', () => {
  let stdioClient: Awaited<ReturnType<typeof createMcpClient>> | null = null

  afterEach(async () => {
    if (stdioClient) {
      await stdioClient.close().catch(() => {})
      stdioClient = null
    }
  })

  it('inmemory connects to builtin schema server', async () => {
    const client = await createMcpClient({
      id: 'test.inmemory.schema',
      transport: 'inmemory',
      builtin: 'schema',
    })
    const { tools } = await client.listTools()
    expect(tools.some((t) => t.name === 'schema__search')).toBe(true)
    await client.close()
  })

  it('stdio connects to echo fixture and invokes echo__ping', async () => {
    stdioClient = await createMcpClient({
      id: 'test.stdio.echo',
      transport: 'stdio',
      command: process.execPath,
      args: ['--import', 'tsx', fixtureServer],
    })

    const { tools } = await stdioClient.listTools()
    expect(tools.map((t) => t.name)).toContain('echo__ping')

    const result = await stdioClient.callTool({
      name: 'echo__ping',
      arguments: { message: 'hi' },
    })
    const text = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
    expect(text).toBe('pong:hi')
  }, 15_000)

  it('stdio rejects missing command', async () => {
    const decl: McpServerDeclaration = {
      id: 'bad.stdio',
      transport: 'stdio',
    }
    await expect(createMcpClient(decl)).rejects.toThrow(/missing command/)
  })

  it('sse rejects missing url', async () => {
    const decl: McpServerDeclaration = {
      id: 'bad.sse',
      transport: 'sse',
    }
    await expect(createMcpClient(decl)).rejects.toThrow(/missing url/)
  })
})

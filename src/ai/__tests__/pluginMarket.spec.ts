/**
 * Plugin market install-from-url tests (A3.3)
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: () => async (ctx: { state: Record<string, unknown> }, next: () => Promise<void>) => {
    ctx.state.user = {
      id: 'user-plugin-1',
      username: 'plugin-user',
      roles: ['user'],
      tenantId: 'tenant-plugin-1',
      deptId: null,
      tokenType: 'access',
    }
    await next()
  },
}))

const writePluginLocalJson = vi.fn().mockResolvedValue({
  path: '/tmp/experts/ext.json',
  reloaded: true,
})

vi.mock('../plugins/pluginLocalWrite.js', () => ({
  writePluginLocalJson: (...args: unknown[]) => writePluginLocalJson(...args),
}))

vi.mock('../plugins/index.js', () => ({
  getPluginRegistry: () => ({
    listExperts: () => [
      {
        id: 'platform.general',
        label: 'General',
        description: 'demo',
        tools: [],
      },
    ],
    listSkills: () => [{ id: 'skill.demo', label: 'Demo', tools: [] }],
    getExpert: (id: string) => (id === 'platform.general' ? { id, label: 'General', tools: [] } : undefined),
  }),
}))

vi.mock('../tools/httpToolExecutor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools/httpToolExecutor.js')>()
  return {
    ...actual,
    resolveAndCheckIP: vi.fn(async () => undefined),
  }
})

const userPluginFind = vi.fn()
const userPluginFindOneAndUpdate = vi.fn().mockResolvedValue({ pluginId: 'ext' })
const pluginFind = vi.fn()
const pluginFindById = vi.fn()
const pluginUpdateOne = vi.fn()

vi.mock('../models/userPlugin.js', () => ({
  UserPluginModel: {
    find: (...args: unknown[]) => userPluginFind(...args),
    findOneAndUpdate: (...args: unknown[]) => userPluginFindOneAndUpdate(...args),
  },
}))

vi.mock('../models/plugin.js', () => ({
  PluginModel: {
    find: (...args: unknown[]) => pluginFind(...args),
    findById: (...args: unknown[]) => pluginFindById(...args),
    updateOne: (...args: unknown[]) => pluginUpdateOne(...args),
  },
}))

import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'node:http'
import { Readable } from 'node:stream'
import pluginMarketRouter from '../pluginMarketRoutes.js'
import {
  assertExternalExpertIdAllowed,
  assertInstallUrlAllowed,
  parseExternalPluginJson,
  PluginMarketError,
  readBodyWithLimit,
} from '../pluginMarketInstall.js'
import { getPluginRegistry } from '../plugins/index.js'
import { resolveAndCheckIP } from '../tools/httpToolExecutor.js'

let server: http.Server | null = null
let baseUrl = ''
let originalFetch: typeof fetch
let originalAllowlist: string | undefined

function mockRemoteResponse(opts: {
  body: string | Buffer
  ok?: boolean
  status?: number
  contentType?: string
  contentLength?: string
}): Response {
  const bytes = typeof opts.body === 'string' ? Buffer.from(opts.body) : opts.body
  const stream = Readable.toWeb(Readable.from([bytes])) as ReadableStream<Uint8Array>
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return opts.contentType ?? 'application/json'
        if (name.toLowerCase() === 'content-length') return opts.contentLength ?? null
        return null
      },
    },
    body: stream,
  } as unknown as Response
}

async function request(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(`${baseUrl}${path}`, init)
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text }
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  originalFetch = globalThis.fetch
  originalAllowlist = process.env.PLUGIN_INSTALL_URL_ALLOWLIST
  process.env.PLUGIN_INSTALL_URL_ALLOWLIST = 'cdn.example.com'
  vi.mocked(resolveAndCheckIP).mockResolvedValue(undefined)

  userPluginFind.mockReturnValue({
    select: () => ({ lean: async () => [] }),
  })
  pluginFind.mockReturnValue({
    sort: () => ({ lean: async () => [] }),
  })
  pluginFindById.mockReturnValue({ lean: async () => null })
  writePluginLocalJson.mockResolvedValue({ path: '/tmp/experts/ext.json', reloaded: true })
  userPluginFindOneAndUpdate.mockResolvedValue({ pluginId: 'example-expert' })

  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }

  const app = new Koa()
  app.use(bodyParser())
  app.use(pluginMarketRouter.routes())
  app.use(pluginMarketRouter.allowedMethods())

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server!.address() as { port: number }
      baseUrl = `http://localhost:${addr.port}`
      resolve()
    })
  })
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  if (originalAllowlist === undefined) {
    delete process.env.PLUGIN_INSTALL_URL_ALLOWLIST
  } else {
    process.env.PLUGIN_INSTALL_URL_ALLOWLIST = originalAllowlist
  }
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
  }
})

describe('assertInstallUrlAllowed', () => {
  it('rejects non-allowlisted hosts', () => {
    expect(() => assertInstallUrlAllowed('https://evil.example/x.json')).toThrow(PluginMarketError)
    try {
      assertInstallUrlAllowed('https://evil.example/x.json')
    } catch (err) {
      expect(err).toBeInstanceOf(PluginMarketError)
      expect((err as PluginMarketError).status).toBe(403)
      expect((err as PluginMarketError).code).toBe('host_not_allowed')
    }
  })

  it('rejects non-http protocols', () => {
    expect(() => assertInstallUrlAllowed('file:///etc/passwd')).toThrow(/http/)
  })

  it('allows listed hosts', () => {
    const url = assertInstallUrlAllowed('https://cdn.example.com/plugins/expert.json')
    expect(url.hostname).toBe('cdn.example.com')
  })
})

describe('assertExternalExpertIdAllowed', () => {
  it('rejects platform.* ids', () => {
    expect(() => assertExternalExpertIdAllowed('platform.general', getPluginRegistry())).toThrow(
      /reserved/,
    )
  })

  it('rejects registry expert collision', () => {
    expect(() => assertExternalExpertIdAllowed('platform.general', getPluginRegistry())).toThrow(
      PluginMarketError,
    )
  })

  it('rejects skill id collision', () => {
    try {
      assertExternalExpertIdAllowed('skill.demo', getPluginRegistry())
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(PluginMarketError)
      expect((err as PluginMarketError).code).toBe('id_conflict')
    }
  })

  it('allows new external ids', () => {
    expect(() => assertExternalExpertIdAllowed('example-expert', getPluginRegistry())).not.toThrow()
  })
})

describe('readBodyWithLimit', () => {
  it('aborts when streamed body exceeds maxBytes', async () => {
    const chunk = Buffer.alloc(100, 0x61)
    const stream = Readable.toWeb(Readable.from([chunk, chunk, chunk])) as ReadableStream<Uint8Array>
    await expect(readBodyWithLimit(stream, 150)).rejects.toMatchObject({
      code: 'body_too_large',
      status: 413,
    })
  })
})

describe('parseExternalPluginJson', () => {
  it('rejects invalid JSON shape', () => {
    expect(() => parseExternalPluginJson([])).toThrow(PluginMarketError)
  })

  it('rejects executable MCP fields', () => {
    expect(() =>
      parseExternalPluginJson({
        id: 'x',
        name: 'X',
        command: 'node',
      }),
    ).toThrow(/Executable/)
  })

  it('accepts expert scaffold', () => {
    const expert = parseExternalPluginJson({
      id: 'example-expert',
      name: 'Example Expert',
      systemPrompt: 'hi',
      tools: ['rag__search'],
      enabled: true,
    })
    expect(expert.id).toBe('example-expert')
    expect(expert.label).toBe('Example Expert')
    expect(expert.tools).toEqual(['rag__search'])
  })
})

describe('POST /api/plugins/market/install-from-url', () => {
  it('rejects allowlist miss with 403', async () => {
    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://not-allowed.example/expert.json',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('host_not_allowed')
    expect(writePluginLocalJson).not.toHaveBeenCalled()
  })

  it('rejects when SSRF IP check fails', async () => {
    vi.mocked(resolveAndCheckIP).mockRejectedValueOnce(
      new Error('SSRF blocked: hostname "cdn.example.com" resolves to reserved IP 127.0.0.1'),
    )
    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/expert.json',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ssrf_blocked')
    expect(writePluginLocalJson).not.toHaveBeenCalled()
  })

  it('rejects Content-Length over max before download', async () => {
    process.env.PLUGIN_INSTALL_MAX_BYTES = '100'
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      return mockRemoteResponse({
        body: '{}',
        contentLength: '99999',
      })
    }) as unknown as typeof fetch

    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/big.json',
    })
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('body_too_large')
    delete process.env.PLUGIN_INSTALL_MAX_BYTES
  })

  it('rejects redirect responses (redirect:error)', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      expect(init?.redirect).toBe('error')
      throw new TypeError('fetch failed: redirect')
    }) as unknown as typeof fetch

    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/redirect.json',
    })
    expect(res.status).toBe(502)
    expect(writePluginLocalJson).not.toHaveBeenCalled()
  })

  it('rejects reserved platform id overwrite', async () => {
    const payload = {
      id: 'platform.general',
      name: 'Hijack',
      systemPrompt: 'evil',
      tools: [],
    }
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      return mockRemoteResponse({ body: JSON.stringify(payload) })
    }) as unknown as typeof fetch

    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/hijack.json',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('reserved_id')
    expect(writePluginLocalJson).not.toHaveBeenCalled()
    expect(userPluginFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON body from remote', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      return mockRemoteResponse({ body: 'not-json' })
    }) as unknown as typeof fetch

    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/bad.json',
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('invalid_json')
  })

  it('installs valid expert JSON into user plugin only (no global write)', async () => {
    const payload = {
      id: 'example-expert',
      name: 'Example Expert',
      systemPrompt: 'You are helpful.',
      tools: ['rag__search'],
      enabled: true,
    }
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return originalFetch(input, init)
      }
      return mockRemoteResponse({ body: JSON.stringify(payload) })
    }) as unknown as typeof fetch

    const res = await request('POST', '/api/plugins/market/install-from-url', {
      url: 'https://cdn.example.com/expert.json',
    })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('example-expert')
    expect(res.body.data.storage).toBe('user-plugin')
    expect(writePluginLocalJson).not.toHaveBeenCalled()
    expect(userPluginFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-plugin-1', pluginId: 'example-expert' },
      expect.objectContaining({
        $set: expect.objectContaining({
          config: expect.objectContaining({
            source: 'url',
            storage: 'user-plugin',
            manifest: expect.objectContaining({ id: 'example-expert' }),
          }),
        }),
      }),
      expect.any(Object),
    )
  })
})

describe('GET /api/plugins/market', () => {
  it('returns registry catalog when DB empty', async () => {
    const res = await request('GET', '/api/plugins/market')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0].id).toBe('platform.general')
  })
})

describe('POST /api/plugins/market/:id/install', () => {
  it('installs registry expert', async () => {
    const res = await request('POST', '/api/plugins/market/platform.general/install')
    expect(res.status).toBe(200)
    expect(res.body.data.installed).toBe(true)
    expect(userPluginFindOneAndUpdate).toHaveBeenCalled()
  })
})

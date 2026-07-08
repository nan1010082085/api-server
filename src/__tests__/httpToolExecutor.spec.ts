/**
 * httpToolExecutor 安全基线测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseIPv4,
  parseIPv6,
  isReservedIPv4,
  isReservedIPv6,
  isReservedIP,
  resolveAndCheckIP,
  executeHttpRequest,
  buildHttpStructuredTool,
  type HttpSecurityConfig,
} from '../ai/tools/httpToolExecutor.js'

// ── 模块级 DNS mock（避免真实 DNS查询） ──────────────────────────────────────
// vi.mock 工厂在 hoisting 阶段执行，必须用 vi.hoisted 声明 mock 函数

const { mockDnsLookup } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  default: { lookup: mockDnsLookup },
  lookup: mockDnsLookup,
}))

// ── 全局 fetch mock ──────────────────────────────────────────────────────────

function createMockResponse(
  body: string,
  status = 200,
  ok = true,
): Response {
  const encoder = new TextEncoder()
  const chunk = encoder.encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk)
      controller.close()
    },
  })

  return {
    status,
    ok,
    body: stream,
    text: async () => body,
    json: async () => JSON.parse(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => createMockResponse(body, status, ok),
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    bytes: async () => new Uint8Array(),
    formData: async () => new FormData(),
  } as unknown as Response
}

/** 默认返回公共 IP，避免 SSRF 阻断 */
function mockDnsToPublic() {
  mockDnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    createMockResponse('{"ok":true}', 200),
  )
  mockDnsToPublic()
})

afterEach(() => {
  fetchSpy.mockRestore()
  mockDnsLookup.mockReset()
  mockDnsToPublic()
})

// ── IPv4 解析 ────────────────────────────────────────────────────────────────

describe('parseIPv4', () => {
  it('should parse valid IPv4', () => {
    expect(parseIPv4('192.168.1.1')).toEqual([192, 168, 1, 1])
    expect(parseIPv4('0.0.0.0')).toEqual([0, 0, 0, 0])
    expect(parseIPv4('255.255.255.255')).toEqual([255, 255, 255, 255])
  })

  it('should reject invalid IPv4', () => {
    expect(parseIPv4('256.1.1.1')).toBeNull()
    expect(parseIPv4('1.2.3')).toBeNull()
    expect(parseIPv4('1.2.3.4.5')).toBeNull()
    expect(parseIPv4('abc.def.ghi.jkl')).toBeNull()
    expect(parseIPv4('-1.0.0.0')).toBeNull()
  })
})

// ── IPv6 解析 ────────────────────────────────────────────────────────────────

describe('parseIPv6', () => {
  it('should parse full IPv6', () => {
    const result = parseIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')
    expect(result).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1])
  })

  it('should parse compact IPv6 with ::', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(parseIPv6('2001:db8::1')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1])
    expect(parseIPv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1])
  })

  it('should parse bracketed IPv6', () => {
    expect(parseIPv6('[::1]')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
  })

  it('should reject invalid IPv6', () => {
    expect(parseIPv6('::1::2')).toBeNull() // 多个 ::
    expect(parseIPv6('gggg::1')).toBeNull() // 非法十六进制
  })
})

// ── 保留 IP 判断 ─────────────────────────────────────────────────────────────

describe('isReservedIPv4', () => {
  it('should detect loopback 127.x', () => {
    expect(isReservedIPv4([127, 0, 0, 1])).toBe(true)
    expect(isReservedIPv4([127, 255, 255, 255])).toBe(true)
  })

  it('should detect 10.x.x.x private', () => {
    expect(isReservedIPv4([10, 0, 0, 1])).toBe(true)
    expect(isReservedIPv4([10, 255, 255, 255])).toBe(true)
  })

  it('should detect 172.16-31.x.x private', () => {
    expect(isReservedIPv4([172, 16, 0, 1])).toBe(true)
    expect(isReservedIPv4([172, 31, 255, 255])).toBe(true)
    expect(isReservedIPv4([172, 15, 0, 1])).toBe(false)
    expect(isReservedIPv4([172, 32, 0, 1])).toBe(false)
  })

  it('should detect 192.168.x.x private', () => {
    expect(isReservedIPv4([192, 168, 0, 1])).toBe(true)
    expect(isReservedIPv4([192, 168, 255, 255])).toBe(true)
  })

  it('should detect 169.254.x.x link-local', () => {
    expect(isReservedIPv4([169, 254, 1, 1])).toBe(true)
  })

  it('should detect 0.x.x.x', () => {
    expect(isReservedIPv4([0, 0, 0, 0])).toBe(true)
  })

  it('should detect CGNAT 100.64-127.x.x', () => {
    expect(isReservedIPv4([100, 64, 0, 1])).toBe(true)
    expect(isReservedIPv4([100, 127, 255, 255])).toBe(true)
    expect(isReservedIPv4([100, 63, 0, 1])).toBe(false)
    expect(isReservedIPv4([100, 128, 0, 1])).toBe(false)
  })

  it('should detect multicast 224-239.x', () => {
    expect(isReservedIPv4([224, 0, 0, 1])).toBe(true)
    expect(isReservedIPv4([239, 255, 255, 255])).toBe(true)
  })

  it('should detect reserved 240+ range', () => {
    expect(isReservedIPv4([240, 0, 0, 0])).toBe(true)
    expect(isReservedIPv4([255, 255, 255, 255])).toBe(true)
  })

  it('should allow public IPs', () => {
    expect(isReservedIPv4([8, 8, 8, 8])).toBe(false)     // Google DNS
    expect(isReservedIPv4([1, 1, 1, 1])).toBe(false)     // Cloudflare
    expect(isReservedIPv4([104, 16, 0, 1])).toBe(false)  // public
    expect(isReservedIPv4([203, 0, 112, 1])).toBe(false) // not 203.0.113
  })
})

describe('isReservedIPv6', () => {
  it('should detect loopback ::1', () => {
    expect(isReservedIPv6([0, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
  })

  it('should detect unspecified ::', () => {
    expect(isReservedIPv6([0, 0, 0, 0, 0, 0, 0, 0])).toBe(true)
  })

  it('should detect fe80::/10 link-local', () => {
    expect(isReservedIPv6([0xfe80, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
    expect(isReservedIPv6([0xfebf, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
  })

  it('should detect fec0::/10 deprecated site-local', () => {
    // fec0 被 site-local 规则拦截（fe80::/10 不覆盖 fec0，但 fec0::/10 独立检查）
    expect(isReservedIPv6([0xfec0, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
  })

  it('should detect fc00::/7 unique local', () => {
    expect(isReservedIPv6([0xfc00, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
    expect(isReservedIPv6([0xfd00, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
  })

  it('should detect ff00::/8 multicast', () => {
    expect(isReservedIPv6([0xff00, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
    expect(isReservedIPv6([0xff02, 0, 0, 0, 0, 0, 0, 1])).toBe(true)
  })

  it('should detect IPv4-mapped ::ffff:reserved', () => {
    // ::ffff:127.0.0.1
    expect(isReservedIPv6([0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001])).toBe(true)
    // ::ffff:10.0.0.1
    expect(isReservedIPv6([0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001])).toBe(true)
    // ::ffff:192.168.1.1
    expect(isReservedIPv6([0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101])).toBe(true)
  })

  it('should detect NAT64 64:ff9b:: reserved', () => {
    // 64:ff9b::127.0.0.1
    expect(isReservedIPv6([0x0064, 0xff9b, 0, 0, 0, 0, 0x7f00, 0x0001])).toBe(true)
  })

  it('should allow public IPv6', () => {
    // 2606:4700:4700::1111 — Cloudflare
    expect(isReservedIPv6([0x2606, 0x4700, 0x4700, 0, 0, 0, 0, 0x1111])).toBe(false)
  })
})

// ── isReservedIP 综合 ────────────────────────────────────────────────────────

describe('isReservedIP', () => {
  it('should classify IPv4 correctly', () => {
    expect(isReservedIP('127.0.0.1')).toBe(true)
    expect(isReservedIP('8.8.8.8')).toBe(false)
  })

  it('should classify IPv6 correctly', () => {
    expect(isReservedIP('::1')).toBe(true)
    expect(isReservedIP('2606:4700:4700::1111')).toBe(false)
  })

  it('should treat unparseable as reserved (fail-closed)', () => {
    expect(isReservedIP('not-an-ip')).toBe(true)
  })
})

// ── DNS 解析 + IP 校验 ───────────────────────────────────────────────────────

describe('resolveAndCheckIP', () => {
  it('should pass for public IP resolved', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    await expect(resolveAndCheckIP('example.com', mockLookup)).resolves.toBeUndefined()
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true, family: 0 })
  })

  it('should block when resolved to loopback', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(resolveAndCheckIP('evil.local', mockLookup)).rejects.toThrow(
      /SSRF blocked.*reserved IP 127\.0\.0\.1/,
    )
  })

  it('should block when resolved to 10.x', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '10.0.0.1', family: 4 }])
    await expect(resolveAndCheckIP('internal.corp', mockLookup)).rejects.toThrow(/SSRF blocked/)
  })

  it('should block when resolved to 172.16.x', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '172.16.0.1', family: 4 }])
    await expect(resolveAndCheckIP('docker.host', mockLookup)).rejects.toThrow(/SSRF blocked/)
  })

  it('should block when resolved to 192.168.x', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '192.168.1.1', family: 4 }])
    await expect(resolveAndCheckIP('router.local', mockLookup)).rejects.toThrow(/SSRF blocked/)
  })

  it('should block when any A record is reserved', async () => {
    const mockLookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(resolveAndCheckIP('dual.example.com', mockLookup)).rejects.toThrow(/SSRF blocked/)
  })

  it('should block IPv6 loopback via DNS', async () => {
    const mockLookup = vi.fn().mockResolvedValue([{ address: '::1', family: 6 }])
    await expect(resolveAndCheckIP('localhost6', mockLookup)).rejects.toThrow(/SSRF blocked/)
  })

  it('should block IP literals directly without DNS', async () => {
    const mockLookup = vi.fn()
    // 127.0.0.1 是 IP 字面量，isReservedIP 直接命中，不走 DNS
    await expect(resolveAndCheckIP('127.0.0.1', mockLookup)).rejects.toThrow(
      /SSRF blocked.*is a reserved IP/,
    )
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('should block IPv6 literal directly without DNS', async () => {
    const mockLookup = vi.fn()
    await expect(resolveAndCheckIP('::1', mockLookup)).rejects.toThrow(/SSRF blocked/)
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('should pass for all public IPs', async () => {
    const mockLookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ])
    await expect(resolveAndCheckIP('example.com', mockLookup)).resolves.toBeUndefined()
  })

  it('should fail when DNS returns no records', async () => {
    const mockLookup = vi.fn().mockResolvedValue([])
    await expect(resolveAndCheckIP('nonexistent', mockLookup)).rejects.toThrow(
      /DNS resolution failed/,
    )
  })
})

// ── executeHttpRequest 安全检查 ──────────────────────────────────────────────

describe('executeHttpRequest', () => {
  beforeEach(() => {
    fetchSpy.mockResolvedValue(createMockResponse('{"ok":true}', 200))
    // 默认 mock DNS 返回公共 IP（避免真实 DNS 查询）
    mockDnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  // ── 基础功能 ──

  it('should return parsed JSON on success', async () => {
    const result = await executeHttpRequest({ url: 'https://example.com/api' })
    expect(result.output.status).toBe(200)
    expect(result.output.data).toEqual({ ok: true })
    expect(result.error).toBeUndefined()
  })

  it('should return error for empty url', async () => {
    const result = await executeHttpRequest({ url: '' })
    expect(result.error).toBe('url is required')
  })

  it('should pass method, headers, body to fetch', async () => {
    await executeHttpRequest({
      method: 'POST',
      url: 'https://example.com/api',
      headers: { 'X-Custom': 'test' },
      body: { key: 'value' },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Custom': 'test' },
        body: JSON.stringify({ key: 'value' }),
      }),
    )
  })

  it('should default to GET method', async () => {
    await executeHttpRequest({ url: 'https://example.com' })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('should return error on non-ok status with raw text', async () => {
    fetchSpy.mockResolvedValue(createMockResponse('{"error":"not found"}', 404, false))
    const result = await executeHttpRequest({ url: 'https://example.com/missing' })
    // JSON 解析成功时 parsed 是 object（非 string），回退到 `HTTP ${status}`
    expect(result.error).toBe('HTTP 404')
    expect(result.output.status).toBe(404)
    expect(result.output.data).toEqual({ error: 'not found' })
  })

  it('should return raw text error when response is not JSON', async () => {
    fetchSpy.mockResolvedValue(createMockResponse('Not Found', 404, false))
    const result = await executeHttpRequest({ url: 'https://example.com/missing' })
    expect(result.error).toBe('Not Found')
  })

  it('should handle non-JSON response as text', async () => {
    fetchSpy.mockResolvedValue(createMockResponse('Hello World', 200))
    const result = await executeHttpRequest({ url: 'https://example.com/text' })
    expect(result.output.data).toBe('Hello World')
  })

  it('should handle fetch network error', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await executeHttpRequest({ url: 'https://example.com' })
    expect(result.error).toBe('ECONNREFUSED')
  })

  // ── 协议限制 ──

  it('should block file:// protocol', async () => {
    const result = await executeHttpRequest({ url: 'file:///etc/passwd' })
    expect(result.error).toMatch(/Blocked protocol/)
  })

  it('should block ftp:// protocol', async () => {
    const result = await executeHttpRequest({ url: 'ftp://example.com/file' })
    expect(result.error).toMatch(/Blocked protocol/)
  })

  it('should block javascript: pseudo-protocol', async () => {
    const result = await executeHttpRequest({ url: 'javascript:alert(1)' })
    expect(result.error).toMatch(/Blocked protocol|Invalid URL/)
  })

  it('should accept http:// and https://', async () => {
    const r1 = await executeHttpRequest({ url: 'http://example.com' })
    expect(r1.error).toBeUndefined()
    const r2 = await executeHttpRequest({ url: 'https://example.com' })
    expect(r2.error).toBeUndefined()
  })

  // ── SSRF 防护 ──

  it('should block direct IP 127.0.0.1', async () => {
    const result = await executeHttpRequest({ url: 'http://127.0.0.1:8080/admin' })
    expect(result.error).toMatch(/SSRF blocked.*reserved IP/)
  })

  it('should block direct IP 10.x.x.x', async () => {
    const result = await executeHttpRequest({ url: 'http://10.0.0.1/api' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block direct IP 172.16.x.x', async () => {
    const result = await executeHttpRequest({ url: 'http://172.16.0.1/api' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block direct IP 192.168.x.x', async () => {
    const result = await executeHttpRequest({ url: 'http://192.168.1.1/api' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block direct IP 169.254.x.x', async () => {
    const result = await executeHttpRequest({ url: 'http://169.254.169.254/metadata' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block IPv6 loopback [::1]', async () => {
    const result = await executeHttpRequest({ url: 'http://[::1]:8080/' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block 0.0.0.0', async () => {
    const result = await executeHttpRequest({ url: 'http://0.0.0.0/' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should block hostname resolving to private IP', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '192.168.1.100', family: 4 }])
    const result = await executeHttpRequest({ url: 'http://internal.corp/api' })
    expect(result.error).toMatch(/SSRF blocked/)
  })

  it('should allow public URLs', async () => {
    const result = await executeHttpRequest({ url: 'http://93.184.216.34/' })
    expect(result.error).toBeUndefined()
  })

  it('should skip SSRF check when ssrfProtection=false', async () => {
    const result = await executeHttpRequest(
      { url: 'http://127.0.0.1:8080/admin' },
      { ssrfProtection: false },
    )
    expect(result.error).toBeUndefined()
  })

  // ── 超时 ──

  it('should timeout after configured duration', async () => {
    fetchSpy.mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        const signal = opts?.signal as AbortSignal | undefined
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
            return
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }
      })
    })

    const result = await executeHttpRequest(
      { url: 'https://93.184.216.34/slow' },
      { timeoutMs: 100 },
    )
    expect(result.error).toMatch(/timeout.*100ms/)
  }, 10000)

  // ── 响应大小限制 ──

  it('should reject response exceeding maxResponseBytes', async () => {
    const bigBody = 'x'.repeat(1024)
    const encoder = new TextEncoder()

    fetchSpy.mockResolvedValue({
      status: 200,
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(bigBody))
          controller.enqueue(encoder.encode(bigBody))
          controller.close()
        },
      }),
    } as unknown as Response)

    const result = await executeHttpRequest(
      { url: 'https://93.184.216.34/big' },
      { maxResponseBytes: 500 },
    )
    expect(result.error).toMatch(/exceeded limit/)
  })

  // ── URL 白名单 ──

  it('should allow URL matching whitelist prefix', async () => {
    const result = await executeHttpRequest(
      { url: 'https://api.example.com/v1/data' },
      { allowedUrlPrefixes: ['https://api.example.com/'] },
    )
    expect(result.error).toBeUndefined()
    expect(result.output.status).toBe(200)
  })

  it('should block URL not matching whitelist', async () => {
    const result = await executeHttpRequest(
      { url: 'https://evil.com/steal' },
      { allowedUrlPrefixes: ['https://api.example.com/'] },
    )
    expect(result.error).toMatch(/not in allowed prefixes/)
  })

  it('should pass all checks when whitelist is empty', async () => {
    const result = await executeHttpRequest({ url: 'https://93.184.216.34/' })
    expect(result.error).toBeUndefined()
  })

  // ── 重定向防护 ──

  it('should pass redirect: error to fetch', async () => {
    await executeHttpRequest({ url: 'https://93.184.216.34/' })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://93.184.216.34/',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  // ── Invalid URL ──

  it('should reject malformed URL', async () => {
    const result = await executeHttpRequest({ url: 'not-a-url' })
    expect(result.error).toMatch(/Invalid URL/)
  })
})

// ── buildHttpStructuredTool ──────────────────────────────────────────────────

describe('buildHttpStructuredTool', () => {
  beforeEach(() => {
    fetchSpy.mockResolvedValue(createMockResponse('{"ok":true}', 200))
    mockDnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  it('should create a DynamicStructuredTool with given name and description', () => {
    const tool = buildHttpStructuredTool('my-http-tool', 'A test tool')
    expect(tool.name).toBe('my-http-tool')
    expect(tool.description).toBe('A test tool')
  })

  it('should use default description when not provided', () => {
    const tool = buildHttpStructuredTool('test')
    expect(tool.description).toContain('HTTP request')
  })

  it('should execute request through the tool func', async () => {
    fetchSpy.mockResolvedValue(createMockResponse('{"result":"ok"}', 200))
    const tool = buildHttpStructuredTool('test')
    const result = await tool.invoke({ url: 'https://93.184.216.34/api' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe(200)
    expect(parsed.data).toEqual({ result: 'ok' })
  })

  it('should return error in tool output when SSRF blocked', async () => {
    const tool = buildHttpStructuredTool('test')
    const result = await tool.invoke({ url: 'http://127.0.0.1:8080/' })
    const parsed = JSON.parse(result)
    expect(parsed.error).toMatch(/SSRF blocked/)
  })

  it('should pass securityConfig to executeHttpRequest', async () => {
    fetchSpy.mockResolvedValue(createMockResponse('{"ok":true}', 200))
    const tool = buildHttpStructuredTool('test', undefined, {
      allowedUrlPrefixes: ['https://93.184.216.34/'],
    })

    // 匹配白名单 — 通过
    const ok = await tool.invoke({ url: 'https://93.184.216.34/data' })
    expect(JSON.parse(ok).status).toBe(200)

    // 不匹配白名单 — 被阻断
    const blocked = await tool.invoke({ url: 'https://evil.com/' })
    expect(JSON.parse(blocked).error).toMatch(/not in allowed prefixes/)
  })
})

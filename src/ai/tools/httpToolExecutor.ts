/**
 * Registry `kind: http` 工具统一执行器 — Chat LangGraph 与 Workflow DAG 共用。
 *
 * 安全基线：SSRF 防护、超时限制、响应大小限制、URL 白名单。
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import dns from 'node:dns/promises'
import { z } from 'zod'

// ── SSRF 防护 ────────────────────────────────────────────────────────────────

/**
 * 将 IPv4 地址字符串解析为四段数值。
 * 非标准格式返回 null。
 */
export function parseIPv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums as [number, number, number, number]
}

/**
 * 将 IPv6 地址规范化为八段 16-bit 整数。
 * 支持 :: 缩写，不支持 IPv4-mapped 嵌入。
 */
export function parseIPv6(ip: string): number[] | null {
  const cleaned = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip

  // 分割 :: 前后两部分
  const doubleColonIdx = cleaned.indexOf('::')
  if (doubleColonIdx !== -1 && cleaned.indexOf('::', doubleColonIdx + 1) !== -1) {
    return null // 最多一个 ::
  }

  let groups: string[]
  if (doubleColonIdx === -1) {
    groups = cleaned.split(':')
  } else {
    const left = cleaned.slice(0, doubleColonIdx).split(':').filter(Boolean)
    const right = cleaned.slice(doubleColonIdx + 2).split(':').filter(Boolean)
    const missing = 8 - left.length - right.length
    if (missing < 0) return null
    groups = [...left, ...Array(missing).fill('0'), ...right]
  }

  if (groups.length !== 8) return null

  const nums = groups.map((g) => {
    if (g === '') return 0
    const n = parseInt(g, 16)
    return Number.isNaN(n) || n < 0 || n > 0xffff ? -1 : n
  })

  return nums.some((n) => n < 0) ? null : nums
}

export function isReservedIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets
  // 127.0.0.0/8 — loopback
  if (a === 127) return true
  // 10.0.0.0/8 — private
  if (a === 10) return true
  // 172.16.0.0/12 — private
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true
  // 169.254.0.0/16 — link-local
  if (a === 169 && b === 254) return true
  // 0.0.0.0/8 — "this network"
  if (a === 0) return true
  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true
  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && octets[2] === 0) return true
  // 192.0.2.0/24 — TEST-NET-1
  if (a === 192 && b === 0 && octets[2] === 2) return true
  // 198.51.100.0/24 — TEST-NET-2
  if (a === 198 && b === 51 && octets[2] === 100) return true
  // 203.0.113.0/24 — TEST-NET-3
  if (a === 203 && b === 0 && octets[2] === 113) return true
  // 224.0.0.0/4 — multicast
  if (a >= 224 && a <= 239) return true
  // 240.0.0.0/4 — reserved
  if (a >= 240) return true
  // 198.18.0.0/15 — benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

export function isReservedIPv6(groups: number[]): boolean {
  // ::1 — loopback
  if (groups[7] === 1 && groups.slice(0, 7).every((g) => g === 0)) return true
  // :: — unspecified
  if (groups.every((g) => g === 0)) return true
  // fe80::/10 — link-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true
  // fc00::/7 — unique local
  if ((groups[0] & 0xfe00) === 0xfc00) return true
  // fec0::/10 — deprecated site-local
  if ((groups[0] & 0xffc0) === 0xfec0) return true
  // ff00::/8 — multicast
  if ((groups[0] & 0xff00) === 0xff00) return true
  // ::ffff:0:0/96 — IPv4-mapped IPv6
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const ipv4Octets: [number, number, number, number] = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ]
    if (isReservedIPv4(ipv4Octets)) return true
  }
  // 64:ff9b::/96 — NAT64
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    const ipv4Octets: [number, number, number, number] = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ]
    if (isReservedIPv4(ipv4Octets)) return true
  }
  return false
}

export function isReservedIP(ip: string): boolean {
  const ipv4 = parseIPv4(ip)
  if (ipv4) return isReservedIPv4(ipv4)
  const ipv6 = parseIPv6(ip)
  if (ipv6) return isReservedIPv6(ipv6)
  return true // 无法解析视为不安全
}

/** 判断字符串是否为合法 IP 字面量（IPv4 或 IPv6）。域名返回 false。 */
export function isIPLiteral(input: string): boolean {
  return parseIPv4(input) !== null || parseIPv6(input) !== null
}

/**
 * 校验 hostname 是否安全（非保留 IP）。
 * 若 hostname 本身是 IP 字面量则直接检查，否则先 DNS 解析再逐一校验。
 */
export async function resolveAndCheckIP(
  hostname: string,
  dnsLookupFn: typeof dns.lookup = dns.lookup,
): Promise<void> {
  // IP 字面量直接检查，无需 DNS 解析
  if (isIPLiteral(hostname) && isReservedIP(hostname)) {
    throw new Error(
      `SSRF blocked: hostname "${hostname}" is a reserved IP`,
    )
  }
  // 非 IP 字面量（域名），需 DNS 解析
  if (!isIPLiteral(hostname)) {
    const records = await dnsLookupFn(hostname, { all: true, family: 0 })
    if (!records || records.length === 0) {
      throw new Error(`DNS resolution failed for hostname: ${hostname}`)
    }
    for (const { address } of records) {
      if (isReservedIP(address)) {
        throw new Error(
          `SSRF blocked: hostname "${hostname}" resolves to reserved IP ${address}`,
        )
      }
    }
  }
}

// ── 配置 ─────────────────────────────────────────────────────────────────────

export interface HttpSecurityConfig {
  /** 请求超时，默认 30s */
  timeoutMs?: number
  /** 响应体最大字节数，默认 10MB */
  maxResponseBytes?: number
  /** 允许的 URL 前缀列表；为空则不限制 */
  allowedUrlPrefixes?: string[]
  /** 是否启用 SSRF 防护，默认 true */
  ssrfProtection?: boolean
}

const DEFAULT_CONFIG: Required<HttpSecurityConfig> = {
  timeoutMs: 30_000,
  maxResponseBytes: 10 * 1024 * 1024,
  allowedUrlPrefixes: [],
  ssrfProtection: true,
}

// ── 限流读取 ─────────────────────────────────────────────────────────────────

async function readResponseBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return ''

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          throw new Error(
            `Response body exceeded limit: ${total} bytes > ${maxBytes} bytes`,
          )
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }

  const decoder = new TextDecoder()
  return chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
    decoder.decode()
}

// ── 主执行器 ─────────────────────────────────────────────────────────────────

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
  config: HttpSecurityConfig = {},
): Promise<{ output: HttpRequestOutput; error?: string }> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    const method = String(args.method ?? 'GET').toUpperCase()
    const url = String(args.url ?? '').trim()

    if (!url) {
      return { output: { status: 0, data: null }, error: 'url is required' }
    }

    // ── 1. 协议校验 ──
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return { output: { status: 0, data: null }, error: `Invalid URL: ${url}` }
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        output: { status: 0, data: null },
        error: `Blocked protocol: ${parsedUrl.protocol}. Only http/https allowed.`,
      }
    }

    // ── 2. URL 白名单 ──
    if (cfg.allowedUrlPrefixes.length > 0) {
      const allowed = cfg.allowedUrlPrefixes.some((prefix) => url.startsWith(prefix))
      if (!allowed) {
        return {
          output: { status: 0, data: null },
          error: `URL not in allowed prefixes: ${url}`,
        }
      }
    }

    // ── 3. SSRF 防护（DNS 解析后检查） ──
    if (cfg.ssrfProtection) {
      try {
        // URL.hostname 对 IPv6 会带方括号，需要去掉再做 DNS / IP 检查
        const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '')
        await resolveAndCheckIP(hostname)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { output: { status: 0, data: null }, error: msg }
      }
    }

    // ── 4. 发起请求（带超时 & 禁止重定向） ──
    const headers = args.headers ?? {}
    const body = args.body != null ? JSON.stringify(args.body) : undefined

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'error', // 禁止跟随重定向，防止 SSRF 绕过
      })
    } finally {
      clearTimeout(timer)
    }

    // ── 5. 限流读取响应体 ──
    const text = await readResponseBody(res.body, cfg.maxResponseBytes)

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
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        output: { status: 0, data: null },
        error: `Request timeout after ${cfg.timeoutMs}ms`,
      }
    }
    if (err instanceof Error && err.message.includes('Response body exceeded limit')) {
      return { output: { status: 0, data: null }, error: err.message }
    }
    const msg = err instanceof Error ? err.message : String(err)
    return { output: { status: 0, data: { error: msg } }, error: msg }
  }
}

// ── LangGraph StructuredTool 构建 ───────────────────────────────────────────

const httpRequestSchema = z.object({
  method: z.string().optional().describe('HTTP method, default GET'),
  url: z.string().describe('Request URL'),
  headers: z.record(z.string()).optional().describe('Request headers'),
  body: z.unknown().optional().describe('JSON request body'),
})

export function buildHttpStructuredTool(
  name: string,
  description?: string,
  securityConfig?: HttpSecurityConfig,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: description ?? 'Send an HTTP request and return status with parsed response body',
    schema: httpRequestSchema,
    func: async (args) => {
      const result = await executeHttpRequest(args, securityConfig)
      return JSON.stringify(result.error ? { ...result.output, error: result.error } : result.output)
    },
  })
}

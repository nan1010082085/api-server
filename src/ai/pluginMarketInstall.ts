/**
 * Plugin market helpers — JSON-only external install (A3.3).
 *
 * Security: http(s) only, host allowlist, SSRF IP check, streaming size limit,
 * no code exec, no global plugins/local write (tenant/user DB only).
 */

import { z } from 'zod'
import { resolveAndCheckIP } from './tools/httpToolExecutor.js'
import type { ExpertDeclaration } from './plugins/types.js'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 512 * 1024

export const installFromUrlBodySchema = z.object({
  url: z.string().url(),
}).strict()

/** External expert / plugin scaffold JSON (declarative only). */
export const externalExpertManifestSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200).optional(),
    label: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    systemPrompt: z.string().max(50_000).optional(),
    tools: z.array(z.string().min(1)).optional(),
    skills: z.array(z.string().min(1)).optional(),
    enabled: z.boolean().optional(),
    legacyAgentKey: z.enum(['editor', 'flow', 'page', 'general', 'router']).optional(),
    routing: z
      .object({
        keywords: z.array(z.string()).optional(),
        contextSources: z
          .array(z.enum(['editor', 'flow', 'page', 'standalone']))
          .optional(),
        priority: z.number().optional(),
      })
      .optional(),
    runtime: z.array(z.enum(['langgraph', 'workflow'])).optional(),
    model: z
      .object({
        temperature: z.number().optional(),
        maxTokens: z.number().optional(),
        task: z.string().optional(),
      })
      .optional(),
  })
  .strict()
  .refine((d) => Boolean(d.name?.trim() || d.label?.trim()), {
    message: 'name or label is required',
  })

export type ExternalExpertManifest = z.infer<typeof externalExpertManifestSchema>

export class PluginMarketError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'PluginMarketError'
  }
}

export function getInstallUrlAllowlist(): string[] {
  const raw = process.env.PLUGIN_INSTALL_URL_ALLOWLIST ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function assertInstallUrlAllowed(urlString: string): URL {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw new PluginMarketError('Invalid URL', 400, 'invalid_url')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PluginMarketError('Only http(s) URLs are allowed', 400, 'invalid_protocol')
  }

  const allowlist = getInstallUrlAllowlist()
  if (allowlist.length === 0) {
    throw new PluginMarketError(
      'Plugin install URL allowlist is empty; set PLUGIN_INSTALL_URL_ALLOWLIST',
      403,
      'allowlist_empty',
    )
  }

  const host = parsed.hostname.toLowerCase()
  if (!allowlist.includes(host)) {
    throw new PluginMarketError(
      `Host "${host}" is not in PLUGIN_INSTALL_URL_ALLOWLIST`,
      403,
      'host_not_allowed',
    )
  }

  return parsed
}

/** Reject reserved / platform / registry-colliding IDs before user install. */
export function assertExternalExpertIdAllowed(
  id: string,
  registry: {
    getExpert: (id: string) => unknown
    listSkills: () => Array<{ id: string }>
  },
): void {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new PluginMarketError('Expert id is required', 422, 'invalid_id')
  }
  if (trimmed.startsWith('platform.')) {
    throw new PluginMarketError(
      'Cannot install over reserved platform.* expert ids',
      403,
      'reserved_id',
    )
  }
  if (registry.getExpert(trimmed)) {
    throw new PluginMarketError(
      `Expert id "${trimmed}" already exists in the platform registry`,
      409,
      'id_conflict',
    )
  }
  if (registry.listSkills().some((s) => s.id === trimmed)) {
    throw new PluginMarketError(
      `Skill id "${trimmed}" already exists in the platform registry`,
      409,
      'id_conflict',
    )
  }
}

export function normalizeExternalExpert(raw: ExternalExpertManifest): ExpertDeclaration {
  const label = (raw.label ?? raw.name)!.trim()
  return {
    id: raw.id.trim(),
    label,
    description: raw.description,
    systemPrompt: raw.systemPrompt,
    tools: raw.tools ?? [],
    skills: raw.skills,
    enabled: raw.enabled ?? true,
    legacyAgentKey: raw.legacyAgentKey,
    routing: raw.routing,
    runtime: raw.runtime,
    model: raw.model,
  }
}

export function parseExternalPluginJson(raw: unknown): ExpertDeclaration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginMarketError('Plugin JSON must be an object', 422, 'invalid_json_shape')
  }

  const obj = raw as Record<string, unknown>

  // Reject executable MCP / factory payloads — declarative expert JSON only
  if ('command' in obj || 'factoryModule' in obj || 'factoryExport' in obj) {
    throw new PluginMarketError(
      'Executable MCP/factory fields are not allowed in URL installs',
      422,
      'code_exec_forbidden',
    )
  }

  const parsed = externalExpertManifestSchema.safeParse(raw)
  if (!parsed.success) {
    throw new PluginMarketError(
      parsed.error.issues.map((i) => i.message).join('; ') || 'Invalid expert manifest',
      422,
      'invalid_manifest',
    )
  }

  return normalizeExternalExpert(parsed.data)
}

/** Stream response body and abort once maxBytes is exceeded. */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0)
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        throw new PluginMarketError(
          `Plugin JSON exceeds max size of ${maxBytes} bytes`,
          413,
          'body_too_large',
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

export async function fetchPluginJsonFromUrl(
  urlString: string,
  fetchImpl: typeof fetch = fetch,
  resolveIp: typeof resolveAndCheckIP = resolveAndCheckIP,
): Promise<unknown> {
  const parsed = assertInstallUrlAllowed(urlString)
  const timeoutMs = Number(process.env.PLUGIN_INSTALL_FETCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const maxBytes = Number(process.env.PLUGIN_INSTALL_MAX_BYTES) || DEFAULT_MAX_BYTES

  try {
    await resolveIp(parsed.hostname)
  } catch (err) {
    throw new PluginMarketError(
      err instanceof Error ? err.message : 'SSRF blocked',
      403,
      'ssrf_blocked',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(parsed.toString(), {
      method: 'GET',
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new PluginMarketError(
        `Failed to fetch plugin JSON: HTTP ${res.status}`,
        502,
        'fetch_failed',
      )
    }

    const contentLength = res.headers.get('content-length')
    if (contentLength) {
      const len = Number(contentLength)
      if (Number.isFinite(len) && len > maxBytes) {
        throw new PluginMarketError(
          `Plugin JSON exceeds max size of ${maxBytes} bytes`,
          413,
          'body_too_large',
        )
      }
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('json') && !contentType.includes('text/plain')) {
      throw new PluginMarketError(
        `Unexpected content-type: ${contentType}`,
        422,
        'invalid_content_type',
      )
    }

    const buf = await readBodyWithLimit(res.body, maxBytes)

    try {
      return JSON.parse(buf.toString('utf8')) as unknown
    } catch {
      throw new PluginMarketError('Response is not valid JSON', 422, 'invalid_json')
    }
  } catch (err) {
    if (err instanceof PluginMarketError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PluginMarketError('Fetch timed out', 504, 'fetch_timeout')
    }
    throw new PluginMarketError(
      err instanceof Error ? err.message : 'Fetch failed',
      502,
      'fetch_failed',
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Persist URL-installed expert for the current user only.
 * Never writes shared plugins/local or hot-reloads the global registry.
 */
export function buildUserPluginInstallConfig(
  expert: ExpertDeclaration,
  url: string,
): Record<string, unknown> {
  return {
    source: 'url',
    url,
    storage: 'user-plugin',
    label: expert.label,
    manifest: expert,
  }
}

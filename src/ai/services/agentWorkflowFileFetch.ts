/**
 * 工作流文档节点 — 通过用户配置的 HTTP 接口拉取文件。
 */

import { getNestedValue } from './agentWorkflowTemplateResolver.js'
import type { WorkflowFilePayload } from './agentWorkflowConversation.js'

const MAX_FETCH_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = Number(process.env.WORKFLOW_FETCH_TIMEOUT_MS ?? 30_000)

export interface WorkflowDocumentFetchConfig {
  fetchUrl?: string
  fetchMethod?: 'GET' | 'POST'
  fetchHeaders?: Record<string, string>
  fetchBody?: string
  fetchResponseMode?: 'binary' | 'json-base64' | 'json-url'
  fetchContentPath?: string
  fetchFilenamePath?: string
  fetchMimetypePath?: string
  fetchFilename?: string
  fetchMimetype?: string
}

function decodeFileContent(raw: unknown): Buffer | null {
  if (raw == null) return null
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof Uint8Array) return Buffer.from(raw)
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const base64 = trimmed.includes(',') ? trimmed.split(',').pop() ?? '' : trimmed
    try {
      return Buffer.from(base64, 'base64')
    } catch {
      return Buffer.from(trimmed, 'utf-8')
    }
  }
  return null
}

function resolveTemplateHeaders(
  headers: Record<string, string> | undefined,
  resolveTemplate: (text: string) => string,
): Record<string, string> {
  if (!headers) return {}
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = resolveTemplate(value)
  }
  return resolved
}

function parseFilenameFromContentDisposition(header: string): string | null {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1].replace(/"/g, '').trim())
  } catch {
    return match[1].replace(/"/g, '').trim()
  }
}

function assertHttpUrl(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`查询接口 URL 无效: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('查询接口仅支持 http/https')
  }
  return parsed
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`查询接口超时（${FETCH_TIMEOUT_MS}ms）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function readBinaryResponse(response: Response): Promise<Buffer> {
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_FETCH_BYTES) {
    throw new Error(`查询接口返回文件过大（>${MAX_FETCH_BYTES / 1024 / 1024}MB）`)
  }
  return buffer
}

async function fetchBinaryFile(
  url: string,
  init: RequestInit,
  fallback: { filename?: string; mimetype?: string },
): Promise<WorkflowFilePayload> {
  const response = await fetchWithTimeout(url, init)
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200)
    throw new Error(`查询接口失败 (${response.status}): ${detail}`)
  }
  const content = await readBinaryResponse(response)
  const mimetype = response.headers.get('content-type')?.split(';')[0]?.trim()
    || fallback.mimetype?.trim()
    || 'application/octet-stream'
  const filename = parseFilenameFromContentDisposition(response.headers.get('content-disposition') ?? '')
    || fallback.filename?.trim()
    || 'download.bin'
  return { filename, mimetype, content }
}

function pickStringField(
  json: unknown,
  path: string | undefined,
  fallback?: string,
): string {
  if (path?.trim()) {
    const val = getNestedValue(json, path.trim())
    if (val != null && String(val).trim()) return String(val).trim()
  }
  return fallback?.trim() || ''
}

export async function resolveWorkflowApiFile(
  data: WorkflowDocumentFetchConfig,
  resolveTemplate: (text: string) => string,
): Promise<WorkflowFilePayload> {
  const url = resolveTemplate(data.fetchUrl ?? '').trim()
  if (!url) {
    throw new Error('未配置查询接口 URL')
  }
  assertHttpUrl(url)

  const method = data.fetchMethod ?? 'GET'
  const headers = resolveTemplateHeaders(data.fetchHeaders, resolveTemplate)
  const init: RequestInit = { method, headers }

  if (method === 'POST' && data.fetchBody?.trim()) {
    init.body = resolveTemplate(data.fetchBody)
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  const mode = data.fetchResponseMode ?? 'json-base64'

  if (mode === 'binary') {
    return fetchBinaryFile(url, init, {
      filename: data.fetchFilename,
      mimetype: data.fetchMimetype,
    })
  }

  const response = await fetchWithTimeout(url, init)
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200)
    throw new Error(`查询接口失败 (${response.status}): ${detail}`)
  }

  const json = await response.json() as unknown
  const contentPath = data.fetchContentPath?.trim() || 'content'
  const rawContent = getNestedValue(json, contentPath)

  if (mode === 'json-url') {
    const downloadUrl = String(rawContent ?? '').trim()
    if (!downloadUrl) {
      throw new Error(`响应中未找到下载地址（路径 ${contentPath}）`)
    }
    assertHttpUrl(downloadUrl)
    return fetchBinaryFile(downloadUrl, { method: 'GET', headers: {} }, {
      filename: pickStringField(json, data.fetchFilenamePath, data.fetchFilename) || 'download.bin',
      mimetype: pickStringField(json, data.fetchMimetypePath, data.fetchMimetype),
    })
  }

  const content = decodeFileContent(rawContent)
  if (!content?.length) {
    throw new Error(`响应中未找到文件内容（路径 ${contentPath}）`)
  }
  if (content.length > MAX_FETCH_BYTES) {
    throw new Error(`查询接口返回文件过大（>${MAX_FETCH_BYTES / 1024 / 1024}MB）`)
  }

  return {
    filename: pickStringField(json, data.fetchFilenamePath, data.fetchFilename) || 'download.bin',
    mimetype: pickStringField(json, data.fetchMimetypePath, data.fetchMimetype) || 'application/octet-stream',
    content,
  }
}

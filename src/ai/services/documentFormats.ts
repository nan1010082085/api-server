/**
 * 文档上传 / 解析支持的格式与 MIME 归一化。
 */

import path from 'node:path'

export type DocumentExtractionKind =
  | 'ocr'
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'csv'
  | 'ofd'
  | 'txt'
  | 'empty'

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/ofd',
  'application/x-ofd',
  'application/octet-stream',
])

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.ofd': 'application/ofd',
}

export const DOCUMENT_FORMAT_LABEL =
  'PNG、JPG、GIF、WebP、PDF、DOC、DOCX、TXT、CSV、OFD'

export const DOCUMENT_UPLOAD_ACCEPT =
  'image/*,.pdf,.doc,.docx,.txt,.csv,.ofd'

export function extensionFromFilename(filename: string): string {
  return path.extname(filename).toLowerCase()
}

export function normalizeUploadMimetype(filename: string, mimetype: string): string {
  const ext = extensionFromFilename(filename)
  const trimmed = mimetype.trim().toLowerCase()

  if (ext && EXTENSION_MIME_MAP[ext]) {
    const mapped = EXTENSION_MIME_MAP[ext]
    if (!trimmed || trimmed === 'application/octet-stream' || trimmed === 'application/vnd.ms-excel') {
      return mapped
    }
    if (ext === '.csv' && trimmed.includes('excel')) {
      return 'text/csv'
    }
  }

  if (trimmed === 'application/x-ofd') {
    return 'application/ofd'
  }

  return trimmed || EXTENSION_MIME_MAP[ext] || 'application/octet-stream'
}

export function isImageMimetype(mimetype: string): boolean {
  return IMAGE_MIME_TYPES.has(mimetype)
}

export function isAllowedUploadFile(filename: string, mimetype: string): boolean {
  const normalized = normalizeUploadMimetype(filename, mimetype)
  if (IMAGE_MIME_TYPES.has(normalized)) return true
  if (DOC_MIME_TYPES.has(normalized)) {
    const ext = extensionFromFilename(filename)
    if (normalized === 'application/octet-stream') {
      return ext === '.ofd' || ext === '.csv'
    }
    return true
  }
  const ext = extensionFromFilename(filename)
  return ext in EXTENSION_MIME_MAP
}

export function resolveExtractionKind(filename: string, mimetype: string): DocumentExtractionKind {
  const normalized = normalizeUploadMimetype(filename, mimetype)
  const ext = extensionFromFilename(filename)

  if (IMAGE_MIME_TYPES.has(normalized)) return 'ocr'
  if (normalized === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (normalized === 'application/msword' || ext === '.doc') return 'doc'
  if (
    normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
  ) {
    return 'docx'
  }
  if (
    normalized === 'text/csv'
    || normalized === 'application/csv'
    || ext === '.csv'
  ) {
    return 'csv'
  }
  if (
    normalized === 'application/ofd'
    || normalized === 'application/x-ofd'
    || ext === '.ofd'
  ) {
    return 'ofd'
  }
  return 'txt'
}

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
  | 'xlsx'
  | 'ofd'
  | 'txt'
  | 'audio-transcribe'
  | 'video-analyze'
  | '3d-preview'
  | 'empty'

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/flac',
])

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
])

const THREE_D_MIME_TYPES = new Set([
  'model/gltf-binary',
  'model/gltf+json',
  'application/octet-stream',
])

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ofd': 'application/ofd',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.m4a': 'audio/m4a',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.obj': 'application/octet-stream',
  '.stl': 'application/octet-stream',
  '.fbx': 'application/octet-stream',
}

export const DOCUMENT_FORMAT_LABEL =
  'PNG、JPG、GIF、WebP、PDF、DOC、DOCX、TXT、CSV、XLS、XLSX、OFD、MP3、WAV、M4A、MP4、MOV、GLB、GLTF'

export const DOCUMENT_UPLOAD_ACCEPT =
  'image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ofd,audio/*,video/mp4,video/webm,video/quicktime,.glb,.gltf'

export function extensionFromFilename(filename: string): string {
  return path.extname(filename).toLowerCase()
}

export function normalizeUploadMimetype(filename: string, mimetype: string): string {
  const ext = extensionFromFilename(filename)
  const trimmed = mimetype.trim().toLowerCase()

  if (ext && EXTENSION_MIME_MAP[ext]) {
    const mapped = EXTENSION_MIME_MAP[ext]
    if (!trimmed || trimmed === 'application/octet-stream') {
      return mapped
    }
    if (ext === '.csv' && trimmed.includes('excel')) {
      return 'text/csv'
    }
    if ((ext === '.xls' || ext === '.xlsx') && trimmed.includes('excel')) {
      return mapped
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

export function isAudioMimetype(mimetype: string): boolean {
  return AUDIO_MIME_TYPES.has(mimetype)
}

export function isVideoMimetype(mimetype: string): boolean {
  return VIDEO_MIME_TYPES.has(mimetype)
}

export function is3DMimetype(mimetype: string, filename?: string): boolean {
  if (THREE_D_MIME_TYPES.has(mimetype)) {
    const ext = filename ? extensionFromFilename(filename) : ''
    return ['.glb', '.gltf', '.obj', '.stl', '.fbx'].includes(ext)
  }
  return false
}

export function isAllowedUploadFile(filename: string, mimetype: string): boolean {
  const normalized = normalizeUploadMimetype(filename, mimetype)
  if (IMAGE_MIME_TYPES.has(normalized)) return true
  if (AUDIO_MIME_TYPES.has(normalized)) return true
  if (VIDEO_MIME_TYPES.has(normalized)) return true
  if (is3DMimetype(normalized, filename)) return true
  if (DOC_MIME_TYPES.has(normalized)) {
    const ext = extensionFromFilename(filename)
    if (normalized === 'application/octet-stream') {
      return ext === '.ofd' || ext === '.csv' || ext === '.xls' || ext === '.xlsx'
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
  if (AUDIO_MIME_TYPES.has(normalized)) return 'audio-transcribe'
  if (VIDEO_MIME_TYPES.has(normalized)) return 'video-analyze'
  if (is3DMimetype(normalized, filename)) return '3d-preview'
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
    normalized === 'application/vnd.ms-excel'
    || normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || ext === '.xls'
    || ext === '.xlsx'
  ) {
    return 'xlsx'
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

/**
 * File processing service — OCR and text extraction.
 *
 * 解析在内存完成；原文件持久化由 documentFileStorage 负责。
 */

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import WordExtractor from 'word-extractor'
import ExcelJS from 'exceljs'
import {
  DOCUMENT_FORMAT_LABEL,
  isAllowedUploadFile,
  isImageMimetype,
  isAudioMimetype,
  isVideoMimetype,
  is3DMimetype,
  normalizeUploadMimetype,
  resolveExtractionKind,
  type DocumentExtractionKind,
} from './documentFormats.js'

export { DOCUMENT_FORMAT_LABEL, DOCUMENT_UPLOAD_ACCEPT } from './documentFormats.js'

export interface ProcessedFile {
  filename: string
  mimetype: string
  size: number
  text: string
  extractionMethod: DocumentExtractionKind
  dataUrl?: string
}

export const VISION_OCR_MODEL = process.env.AI_VISION_OCR_MODEL || ''
export const DOCUMENT_TEXT_MODEL = process.env.AI_DOCUMENT_TEXT_MODEL || ''

import { MAX_FILE_SIZE } from '../config.js'

/**
 * 调用视觉模型进行图片理解。
 * 通过 getLLM() 统一调用，走 Provider+Model DB 链路。
 * 支持 OpenAI 兼容的多模态消息格式。
 * @param nodeModel 节点级指定的模型（可选），优先级高于环境变量
 */
async function callVisionModel(
  base64Image: string,
  mimeType: string,
  textPrompt: string,
  maxTokens = 4096,
  nodeModel?: string,
): Promise<string> {
  const { HumanMessage } = await import('@langchain/core/messages')
  const { getLLM } = await import('./llmCache.js')

  // 优先级：节点指定模型 > 环境变量视觉模型 > 默认模型
  const modelOpts: Record<string, unknown> = { maxTokens }
  if (nodeModel && nodeModel !== 'default') {
    modelOpts.model = nodeModel
  } else if (VISION_OCR_MODEL) {
    modelOpts.model = VISION_OCR_MODEL
  }

  const llm = await getLLM(modelOpts)

  const dataUrl = `data:${mimeType};base64,${base64Image}`

  const message = new HumanMessage({
    content: [
      { type: 'text', text: textPrompt },
      { type: 'image_url', image_url: { url: dataUrl } },
    ],
  })

  const response = await llm.invoke([message])
  return typeof response.content === 'string' ? response.content : ''
}

async function performOCR(base64Image: string, mimeType: string, nodeModel?: string): Promise<string> {
  return callVisionModel(
    base64Image,
    mimeType,
    '请仔细识别图片中的所有文字内容，包括表格、表单字段、标签等。直接输出识别到的文字，不要添加额外说明。',
    4096,
    nodeModel,
  )
}

const DEFAULT_VISION_PROMPT =
  '请从视觉语义角度描述这张图片：场景、主体、布局、UI/表单结构、图表类型、颜色与空间关系等。文字内容可简要概括，重点不是逐字 OCR。'

export async function performVisionAnalysis(
  base64Image: string,
  mimeType: string,
  customPrompt?: string,
  nodeModel?: string,
): Promise<string> {
  const prompt = customPrompt?.trim() || DEFAULT_VISION_PROMPT
  return callVisionModel(base64Image, mimeType, prompt, 4096, nodeModel)
}

export function parseImagePayload(image: string): { base64: string; mimeType: string } {
  const trimmed = image.trim()
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(trimmed)
  if (dataUrlMatch) {
    return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] }
  }
  return { mimeType: 'image/jpeg', base64: trimmed }
}

export async function analyzeImagePayload(
  image: string,
  customPrompt?: string,
): Promise<{ description: string; mimetype: string }> {
  const { base64, mimeType } = parseImagePayload(image)
  if (!isImageMimetype(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`)
  }
  const description = await performVisionAnalysis(base64, mimeType, customPrompt)
  return { description, mimetype: mimeType }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const textResult = await parser.getText()
    return textResult.text
  } finally {
    await parser.destroy()
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function extractDocText(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor()
  const document = await extractor.extract(buffer)
  return document.getBody()
}

function extractPlainText(buffer: Buffer): string {
  let text = buffer.toString('utf-8')
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1)
  }
  return text
}

function collectOfdTextFromXml(xml: string): string[] {
  const parts: string[] = []
  const textCodePattern = /<(?:[\w-]+:)?TextCode[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?TextCode>/gi
  let match: RegExpExecArray | null
  while ((match = textCodePattern.exec(xml)) !== null) {
    const raw = match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (raw) parts.push(raw)
  }
  return parts
}

async function extractExcelText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const parts: string[] = []

  workbook.eachSheet((sheet, sheetId) => {
    if (sheet.rowCount === 0) return
    parts.push(`=== Sheet ${sheetId}: ${sheet.name} ===`)

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value
        if (val === null || val === undefined) return
        if (typeof val === 'object') {
          if ('richText' in val) {
            cells.push(val.richText.map((r: { text: string }) => r.text).join(''))
          } else if ('text' in val && 'hyperlink' in val) {
            cells.push(val.text)
          } else if ('formula' in val) {
            cells.push(String(val.result ?? ''))
          } else if (val instanceof Date) {
            cells.push(val.toISOString())
          } else {
            cells.push(String(val))
          }
        } else {
          cells.push(String(val))
        }
      })
      if (cells.length > 0) {
        parts.push(cells.join('\t'))
      }
    })
  })

  return parts.join('\n').trim()
}

async function extractOfdText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const parts: string[] = []

  const contentEntries = Object.keys(zip.files)
    .filter((name) => /\/Content\.xml$/i.test(name) || /Document\.xml$/i.test(name))
    .sort()

  for (const name of contentEntries) {
    const file = zip.files[name]
    if (!file || file.dir) continue
    const xml = await file.async('string')
    parts.push(...collectOfdTextFromXml(xml))
  }

  if (parts.length === 0) {
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith('.xml') || zip.files[name]?.dir) continue
      const xml = await zip.files[name].async('string')
      parts.push(...collectOfdTextFromXml(xml))
    }
  }

  return parts.join('\n').trim()
}

async function extractDocumentText(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const kind = resolveExtractionKind(filename, mimetype)

  switch (kind) {
    case 'pdf':
      return extractPdfText(buffer)
    case 'docx':
      return extractDocxText(buffer)
    case 'doc':
      return extractDocText(buffer)
    case 'csv':
      return extractPlainText(buffer)
    case 'xlsx':
      return extractExcelText(buffer)
    case 'ofd':
      return extractOfdText(buffer)
    default:
      return extractPlainText(buffer)
  }
}

export async function processFile(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  nodeModel?: string,
): Promise<ProcessedFile> {
  const normalizedMimetype = normalizeUploadMimetype(filename, mimetype)

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }

  if (!isAllowedUploadFile(filename, normalizedMimetype)) {
    throw new Error(`Unsupported file type: ${mimetype || filename}. Allowed: ${DOCUMENT_FORMAT_LABEL}`)
  }

  if (isImageMimetype(normalizedMimetype)) {
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${normalizedMimetype};base64,${base64}`
    const text = await performOCR(base64, normalizedMimetype, nodeModel)

    return {
      filename,
      mimetype: normalizedMimetype,
      size: buffer.length,
      text,
      extractionMethod: text.trim() ? 'ocr' : 'empty',
      dataUrl,
    }
  }

  if (isAudioMimetype(normalizedMimetype)) {
    const text = await transcribeAudio(buffer, filename, nodeModel)
    return {
      filename,
      mimetype: normalizedMimetype,
      size: buffer.length,
      text,
      extractionMethod: text.trim() ? 'audio-transcribe' : 'empty',
    }
  }

  if (isVideoMimetype(normalizedMimetype)) {
    const text = await analyzeVideo(buffer, filename, undefined, nodeModel)
    return {
      filename,
      mimetype: normalizedMimetype,
      size: buffer.length,
      text,
      extractionMethod: text.trim() ? 'video-analyze' : 'empty',
    }
  }

  if (is3DMimetype(normalizedMimetype, filename)) {
    // 3D files are rendered client-side; server just stores and returns metadata
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${normalizedMimetype};base64,${base64}`
    return {
      filename,
      mimetype: normalizedMimetype,
      size: buffer.length,
      text: `[3D 模型: ${filename}]`,
      extractionMethod: '3d-preview',
      dataUrl,
    }
  }

  const text = await extractDocumentText(buffer, filename, normalizedMimetype)
  const kind = resolveExtractionKind(filename, normalizedMimetype)
  const extractionMethod: DocumentExtractionKind = text.trim() ? kind : 'empty'

  return {
    filename,
    mimetype: normalizedMimetype,
    size: buffer.length,
    text,
    extractionMethod,
  }
}

export function isAllowedFileType(filename: string, mimetype: string): boolean {
  return isAllowedUploadFile(filename, mimetype)
}

export function isImageType(mimetype: string): boolean {
  return isImageMimetype(normalizeUploadMimetype('image.bin', mimetype))
}

/**
 * Transcribe audio using OpenAI Whisper-compatible API.
 */
async function transcribeAudio(buffer: Buffer, filename: string, nodeModel?: string): Promise<string> {
  const { default: OpenAI } = await import('openai')

  // Use environment variables for Whisper API
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_OPENAI_API_KEY || ''
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.AI_OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('未配置 OPENAI_API_KEY，无法进行音频转录。请设置环境变量或在模型管理中添加 OpenAI 供应商。')
  }

  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  // Create a File-like object from buffer
  const ext = filename.split('.').pop() || 'mp3'
  const mimeTypeMap: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/m4a',
    webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac',
  }
  const file = new File([buffer], filename, { type: mimeTypeMap[ext] || 'audio/mpeg' })

  try {
    const model = nodeModel && nodeModel !== 'default' ? nodeModel : 'whisper-1'
    const response = await client.audio.transcriptions.create({
      file,
      model,
      language: 'zh',
    })
    return response.text || ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`音频转录失败: ${msg}`)
  }
}

/**
 * Analyze video by extracting keyframes and using vision model.
 * Uses ffmpeg if available, otherwise falls back to treating video as binary.
 */
async function analyzeVideo(
  buffer: Buffer,
  filename: string,
  customPrompt?: string,
  nodeModel?: string,
): Promise<string> {
  const { execFile } = await import('node:child_process')
  const { writeFile, unlink, mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'video-'))

  try {
    const inputPath = path.join(tmpDir, filename)
    await writeFile(inputPath, buffer)

    // Extract keyframes (1 frame per 10 seconds, max 10 frames)
    const framePattern = path.join(tmpDir, 'frame-%03d.jpg')
    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', [
        '-i', inputPath,
        '-vf', 'fps=1/10,scale=1280:-1',
        '-frames:v', '10',
        '-q:v', '2',
        framePattern,
      ], { timeout: 30_000 }, (err) => {
        if (err) reject(new Error(`ffmpeg 帧提取失败: ${err.message}`))
        else resolve()
      })
    })

    // Read extracted frames
    const fs = await import('node:fs/promises')
    const files = await fs.readdir(tmpDir)
    const frameFiles = files.filter(f => f.startsWith('frame-') && f.endsWith('.jpg')).sort()

    if (frameFiles.length === 0) {
      throw new Error('未能从视频中提取帧，请确认文件为有效视频格式')
    }

    // Analyze each frame with vision model
    const descriptions: string[] = []
    const prompt = customPrompt?.trim() || '请描述这个视频帧中的场景、人物、动作、文字等信息。'

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(tmpDir, frameFiles[i])
      const frameBuffer = await fs.readFile(framePath)
      const base64 = frameBuffer.toString('base64')
      const description = await callVisionModel(base64, 'image/jpeg', prompt, 2048, nodeModel)
      descriptions.push(`[帧 ${i + 1}/${frameFiles.length}] ${description}`)
    }

    return descriptions.join('\n\n')
  } finally {
    // Cleanup
    const fs = await import('node:fs/promises').catch(() => null)
    if (fs) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

export { transcribeAudio, analyzeVideo }

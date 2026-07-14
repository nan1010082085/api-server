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

export const VISION_OCR_MODEL = process.env.AI_VISION_OCR_MODEL || 'deepseek-v4-flash'
export const DOCUMENT_TEXT_MODEL = process.env.AI_DOCUMENT_TEXT_MODEL || 'deepseek-v4-flash'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

async function callVisionModel(
  base64Image: string,
  mimeType: string,
  textPrompt: string,
  maxTokens = 4096,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required.')
  }

  const dataUrl = `data:${mimeType};base64,${base64Image}`

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepSeek API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  return data.choices[0]?.message?.content ?? ''
}

async function performOCR(base64Image: string, mimeType: string): Promise<string> {
  return callVisionModel(
    base64Image,
    mimeType,
    '请仔细识别图片中的所有文字内容，包括表格、表单字段、标签等。直接输出识别到的文字，不要添加额外说明。',
  )
}

const DEFAULT_VISION_PROMPT =
  '请从视觉语义角度描述这张图片：场景、主体、布局、UI/表单结构、图表类型、颜色与空间关系等。文字内容可简要概括，重点不是逐字 OCR。'

export async function performVisionAnalysis(
  base64Image: string,
  mimeType: string,
  customPrompt?: string,
): Promise<string> {
  const prompt = customPrompt?.trim() || DEFAULT_VISION_PROMPT
  return callVisionModel(base64Image, mimeType, prompt)
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
    const text = await performOCR(base64, normalizedMimetype)

    return {
      filename,
      mimetype: normalizedMimetype,
      size: buffer.length,
      text,
      extractionMethod: text.trim() ? 'ocr' : 'empty',
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

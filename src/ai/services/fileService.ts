/**
 * File processing service — OCR and text extraction.
 *
 * 解析在内存完成；原文件持久化由 documentFileStorage 负责。
 */

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

// ---- Types ----

export interface ProcessedFile {
  /** Original filename */
  filename: string
  /** MIME type */
  mimetype: string
  /** File size in bytes */
  size: number
  /** Extracted text content */
  text: string
  extractionMethod: 'ocr' | 'pdf' | 'docx' | 'txt' | 'empty'
  /** Base64 data URL for images (ephemeral) */
  dataUrl?: string
}

// ---- Constants ----

export const VISION_OCR_MODEL = process.env.AI_VISION_OCR_MODEL || 'deepseek-v4-flash'
/** 文本摘要 / 对话默认模型（与 OCR 视觉模型分离） */
export const DOCUMENT_TEXT_MODEL = process.env.AI_DOCUMENT_TEXT_MODEL || 'deepseek-v4-flash'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ALLOWED_DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

// ---- Vision API (DeepSeek VL) ----

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

// ---- OCR via DeepSeek VL ----

async function performOCR(base64Image: string, mimeType: string): Promise<string> {
  return callVisionModel(
    base64Image,
    mimeType,
    '请仔细识别图片中的所有文字内容，包括表格、表单字段、标签等。直接输出识别到的文字，不要添加额外说明。',
  )
}

const DEFAULT_VISION_PROMPT =
  '请从视觉语义角度描述这张图片：场景、主体、布局、UI/表单结构、图表类型、颜色与空间关系等。文字内容可简要概括，重点不是逐字 OCR。'

/** 纯视觉语义描述（非 OCR） */
export async function performVisionAnalysis(
  base64Image: string,
  mimeType: string,
  customPrompt?: string,
): Promise<string> {
  const prompt = customPrompt?.trim() || DEFAULT_VISION_PROMPT
  return callVisionModel(base64Image, mimeType, prompt)
}

/** 解析 data URL 或裸 base64，返回 { base64, mimeType } */
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
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`)
  }
  const description = await performVisionAnalysis(base64, mimeType, customPrompt)
  return { description, mimetype: mimeType }
}

// ---- Text extraction from documents ----

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

function extractPlainText(buffer: Buffer): string {
  return buffer.toString('utf-8')
}

// ---- Main processing function ----

/**
 * Process an uploaded file buffer.
 *
 * - Images: OCR via DeepSeek VL, returns text + dataUrl for multimodal context
 * - PDFs: text extraction via pdf-parse
 * - DOC/DOCX: text extraction via mammoth
 * - TXT: direct UTF-8 read
 */
export async function processFile(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<ProcessedFile> {
  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }

  // Image processing — OCR via vision model (flash), downstream LLM only sees text
  if (ALLOWED_IMAGE_TYPES.has(mimetype)) {
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimetype};base64,${base64}`
    const text = await performOCR(base64, mimetype)

    return {
      filename,
      mimetype,
      size: buffer.length,
      text,
      extractionMethod: text.trim() ? 'ocr' : 'empty',
      dataUrl,
    }
  }

  // Document processing
  if (!ALLOWED_DOC_TYPES.has(mimetype)) {
    throw new Error(`Unsupported file type: ${mimetype}. Allowed: images, PDF, DOC, DOCX, TXT`)
  }

  let text = ''

  if (mimetype === 'application/pdf') {
    text = await extractPdfText(buffer)
  } else if (
    mimetype === 'application/msword' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    text = await extractDocxText(buffer)
  } else {
    // text/plain
    text = extractPlainText(buffer)
  }

  const extractionMethod = !text.trim()
    ? 'empty'
    : mimetype === 'application/pdf'
      ? 'pdf'
      : mimetype === 'text/plain'
        ? 'txt'
        : 'docx'

  return {
    filename,
    mimetype,
    size: buffer.length,
    text,
    extractionMethod,
  }
}

/**
 * Validate that the file type is supported.
 */
export function isAllowedFileType(mimetype: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimetype) || ALLOWED_DOC_TYPES.has(mimetype)
}

/**
 * Check if the MIME type is an image type.
 */
export function isImageType(mimetype: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimetype)
}

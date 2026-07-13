/**
 * 图片压缩工具 — 用于 vision-analyze 节点的预处理
 * 将图片缩放到指定宽度并调整 JPEG 质量，减少视觉模型 API 的 token 消耗
 */

import sharp from 'sharp'

export interface ImageCompressOptions {
  /** 目标宽度（px），不设置则不缩放 */
  maxWidth?: number
  /** JPEG 质量 1-100，不设置则不压缩 */
  quality?: number
}

/**
 * 压缩图片 buffer
 * @param input 原始图片 buffer
 * @param mimeType 原始 MIME 类型
 * @param options 压缩选项
 * @returns 压缩后的 base64 和 MIME 类型
 */
export async function compressImage(
  input: Buffer,
  mimeType: string,
  options: ImageCompressOptions,
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const { maxWidth, quality } = options

  // 无需压缩
  if (!maxWidth && !quality) {
    return {
      base64: input.toString('base64'),
      mimeType,
      width: 0,
      height: 0,
    }
  }

  let pipeline = sharp(input)

  // 获取原始尺寸
  const metadata = await pipeline.metadata()
  const originalWidth = metadata.width ?? 0
  const originalHeight = metadata.height ?? 0

  // 缩放
  if (maxWidth && originalWidth > maxWidth) {
    pipeline = pipeline.resize(maxWidth, undefined, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // 输出 JPEG（统一格式，便于控制质量）
  if (quality) {
    pipeline = pipeline.jpeg({ quality: Math.max(1, Math.min(100, quality)) })
  }

  const outputBuffer = await pipeline.toBuffer()
  const outputMeta = await sharp(outputBuffer).metadata()

  return {
    base64: outputBuffer.toString('base64'),
    mimeType: quality ? 'image/jpeg' : mimeType,
    width: outputMeta.width ?? originalWidth,
    height: outputMeta.height ?? originalHeight,
  }
}

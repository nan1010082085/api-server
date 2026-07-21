/**
 * 视频生成服务
 *
 * 文生视频：提交生成任务 -> 轮询状态 -> 返回视频 URL。
 * 节点执行时内置轮询，对工作流执行器透明（节点自己等到完成才返回）。
 *
 * API 约定（OpenAI 兼容风格）：
 *   POST {baseUrl}/videos/generations           -> { id, status: 'pending'|'processing' }
 *   GET  {baseUrl}/videos/generations/:id       -> { id, status, video?: { url }, error?: string }
 *
 * 用户在模型中心配置具备 video 能力的模型及其供应商 baseUrl/apiKey。
 */

import { ModelModel } from '../../models/Model.js'
import { ProviderModel } from '../../models/Provider.js'
import { resolveStoredProviderApiKey } from '../../models/Provider.js'
import { resolveProviderEnvApiKey } from '../../utils/modelProviderEnv.js'

const logger = { info: console.log, error: console.error, warn: console.warn }

// ---- Types ----

export interface VideoGenerationRequest {
  prompt: string
  /** 模型中心的 model id（优先） */
  modelId?: string
  /** 模型标识（fallback） */
  model?: string
  duration?: number
  resolution?: string
  /** 轮询间隔（毫秒），默认 5000 */
  pollIntervalMs?: number
  /** 最大轮询时长（毫秒），默认 300000 */
  pollTimeoutMs?: number
}

export interface VideoGenerationResult {
  videoUrl: string
  taskId: string
  model: string
  provider: string
}

interface ResolvedVideoProvider {
  apiKey: string
  baseUrl: string
  model: string
  providerName: string
}

// ---- Resolver ----

export async function resolveVideoProvider(options: {
  modelId?: string
  model?: string
}): Promise<ResolvedVideoProvider> {
  const { modelId, model } = options

  if (modelId) {
    try {
      const doc = await ModelModel.findById(modelId).populate('providerId')
      if (doc && doc.providerId) {
        const provider = doc.providerId as unknown as {
          _id: string; name: string; type: string; baseUrl: string; apiKey: string; isActive: boolean
        }
        if (provider.isActive) {
          const apiKey = resolveStoredProviderApiKey(provider.apiKey)
            || resolveProviderEnvApiKey(provider.type)
          if (apiKey) {
            return {
              apiKey,
              baseUrl: provider.baseUrl.replace(/\/+$/, ''),
              model: doc.model,
              providerName: provider.name,
            }
          }
        }
      }
    } catch (err) {
      logger.warn('[videoGenerationService] Model center lookup failed:', (err as Error).message)
    }
  }

  // Fallback：环境变量
  const envApiKey = process.env.VIDEO_GENERATION_API_KEY || process.env.OPENAI_API_KEY
  const envBaseUrl = (process.env.VIDEO_GENERATION_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl: envBaseUrl,
      model: model || process.env.VIDEO_GENERATION_MODEL || 'sora-2',
      providerName: 'env',
    }
  }

  return {
    apiKey: '',
    baseUrl: envBaseUrl,
    model: model || 'sora-2',
    providerName: 'none',
  }
}

// ---- Caller (with polling) ----

/**
 * 提交视频生成任务并轮询直到完成。
 * @throws Error 任务失败或超时时抛出
 */
export async function generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
  const provider = await resolveVideoProvider({ modelId: req.modelId, model: req.model })

  if (!provider.apiKey) {
    throw new Error(
      '视频生成 API 未配置。请在模型中心配置具备视频生成能力的模型及其供应商密钥，或在 .env 中设置 VIDEO_GENERATION_API_KEY。',
    )
  }

  const pollInterval = req.pollIntervalMs ?? 5000
  const pollTimeout = req.pollTimeoutMs ?? 300000

  // 1. 提交生成任务
  const submitResponse = await fetch(`${provider.baseUrl}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      prompt: req.prompt,
      duration: req.duration ?? 8,
      resolution: req.resolution ?? '720p',
    }),
  })

  if (!submitResponse.ok) {
    const errBody = await submitResponse.text()
    logger.error({ msg: '[videoGenerationService] Submit API error', status: submitResponse.status, body: errBody })
    throw new Error(`Video generation submit failed: ${submitResponse.status}`)
  }

  const submitData = await submitResponse.json() as {
    id?: string
    status?: string
    video?: { url?: string }
  }

  // 某些同步 API 直接返回结果
  if (submitData.video?.url) {
    return {
      videoUrl: submitData.video.url,
      taskId: submitData.id ?? '',
      model: provider.model,
      provider: provider.providerName,
    }
  }

  const taskId = submitData.id
  if (!taskId) {
    throw new Error('Video generation API did not return a task id')
  }

  // 2. 轮询任务状态
  const startTime = Date.now()
  while (Date.now() - startTime < pollTimeout) {
    await sleep(pollInterval)

    const pollResponse = await fetch(`${provider.baseUrl}/videos/generations/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${provider.apiKey}` },
    })

    if (!pollResponse.ok) {
      const errBody = await pollResponse.text()
      logger.error({ msg: '[videoGenerationService] Poll API error', status: pollResponse.status, body: errBody })
      throw new Error(`Video generation poll failed: ${pollResponse.status}`)
    }

    const pollData = await pollResponse.json() as {
      status?: string
      video?: { url?: string }
      error?: string
    }

    if (pollData.status === 'succeeded' || pollData.status === 'completed') {
      const url = pollData.video?.url
      if (!url) {
        throw new Error('Video generation succeeded but no video URL returned')
      }
      return {
        videoUrl: url,
        taskId,
        model: provider.model,
        provider: provider.providerName,
      }
    }

    if (pollData.status === 'failed' || pollData.status === 'error') {
      throw new Error(`Video generation failed: ${pollData.error ?? 'unknown error'}`)
    }

    // processing / pending -> 继续轮询
  }

  throw new Error(`Video generation timed out after ${pollTimeout}ms (task ${taskId})`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

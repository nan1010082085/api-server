/**
 * 图像生成服务
 *
 * 统一模型中心（Model -> Provider）与 OpenAI 兼容的 /images/generations 接口调用。
 * 供 advancedFeatureRoutes（REST 端点）和 agentWorkflowExecutor（工作流节点）共用。
 */

import { ModelModel } from '../../models/Model.js'
import { ProviderModel } from '../../models/Provider.js'
import { resolveStoredProviderApiKey } from '../../models/Provider.js'
import { resolveProviderEnvApiKey } from '../../utils/modelProviderEnv.js'

const logger = { info: console.log, error: console.error, warn: console.warn }

// ---- Types ----

export interface ImageGenerationRequest {
  prompt: string
  /** 模型中心的 model id（优先，自动解析 Provider baseUrl/apiKey） */
  modelId?: string
  /** 模型标识（fallback，不走模型中心时直接用） */
  model?: string
  size?: string
  style?: string
  quality?: string
  /** 生成图片数量 1-10，默认 1 */
  n?: number
}

export interface ImageGenerationResult {
  images: Array<{ url: string; revisedPrompt?: string }>
  model: string
  provider: string
}

interface ResolvedImageProvider {
  apiKey: string
  baseUrl: string
  model: string
  providerName: string
}

// ---- Resolver ----

/**
 * 解析图像生成的 Provider baseUrl + apiKey。
 * 优先从模型中心 Model -> Provider 链路解析；失败则回退到环境变量。
 */
export async function resolveImageProvider(options: {
  modelId?: string
  model?: string
}): Promise<ResolvedImageProvider> {
  const { modelId, model } = options

  // 优先：模型中心查找
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
      logger.warn('[imageGenerationService] Model center lookup failed:', (err as Error).message)
    }
  }

  // Fallback：环境变量
  const envApiKey = process.env.OPENAI_API_KEY || process.env.IMAGE_GENERATION_API_KEY
  const envBaseUrl = (process.env.IMAGE_GENERATION_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl: envBaseUrl,
      model: model || 'dall-e-3',
      providerName: 'env',
    }
  }

  return {
    apiKey: '',
    baseUrl: envBaseUrl,
    model: model || 'dall-e-3',
    providerName: 'none',
  }
}

// ---- Caller ----

/**
 * 调用 OpenAI 兼容的 /images/generations 接口生成图片。
 * @throws Error 调用失败时抛出
 */
export async function generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const provider = await resolveImageProvider({ modelId: req.modelId, model: req.model })

  if (!provider.apiKey) {
    throw new Error(
      '图片生成 API 未配置。请在模型中心配置具备图像生成能力的模型及其供应商密钥，或在 .env 中设置 OPENAI_API_KEY。',
    )
  }

  const n = Math.min(Math.max(req.n ?? 1, 1), 10)
  const size = req.size ?? '1024x1024'
  const style = req.style ?? 'vivid'
  const quality = req.quality ?? 'standard'

  const response = await fetch(`${provider.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      prompt: req.prompt,
      n,
      size,
      style,
      quality,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    logger.error({ msg: '[imageGenerationService] API error', status: response.status, body: errBody })
    throw new Error(`Image generation API error: ${response.status}`)
  }

  const data = await response.json() as {
    data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
  }

  const images = (data.data ?? [])
    .map((item) => ({
      url: item.url ?? item.b64_json ?? '',
      revisedPrompt: item.revised_prompt,
    }))
    .filter((img) => img.url)

  if (images.length === 0) {
    throw new Error('No image returned from generation API')
  }

  return {
    images,
    model: provider.model,
    provider: provider.providerName,
  }
}

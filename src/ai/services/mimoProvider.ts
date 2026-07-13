/**
 * Mimo LLM Provider — OpenAI 兼容接口。
 * 文档：ai/docs/environment-variables.md
 */

import OpenAI from 'openai'
import { ChatOpenAI } from '@langchain/openai'
import type {
  LLMProvider,
  Message,
  ChatOptions,
  ChatResponse,
  Chunk,
  ProviderConfig,
  LangChainModelOptions,
  UsageStats,
} from './llmProvider.js'

export class MimoProvider implements LLMProvider {
  readonly name = 'mimo'
  readonly models = ['mimo-v2.5']
  readonly defaultModel = 'mimo-v2.5'
  readonly costPer1kPromptTokens = 0.0002
  readonly costPer1kCompletionTokens = 0.0008
  readonly qualityScore = 82
  readonly speedScore = 88

  private client: OpenAI
  private config: ProviderConfig
  private usage: UsageStats = {
    totalTokens: 0,
    totalCost: 0,
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
  }

  constructor(config: ProviderConfig) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://token-plan-cn.xiaomimimo.com/v1',
    })
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model || this.config.defaultModel || this.defaultModel,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('No response from Mimo API')
    }

    const promptTokens = response.usage?.prompt_tokens || 0
    const completionTokens = response.usage?.completion_tokens || 0
    const totalTokens = response.usage?.total_tokens || 0
    this.trackUsage(promptTokens, completionTokens, totalTokens)

    return {
      content: choice.message.content || '',
      usage: {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
      },
    }
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<Chunk> {
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.config.defaultModel || this.defaultModel,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta?.content) continue
      yield { content: delta.content }
    }
  }

  createLangChainModel(options?: LangChainModelOptions): ChatOpenAI {
    return new ChatOpenAI({
      model: options?.model || this.config.defaultModel || this.defaultModel,
      apiKey: this.config.apiKey,
      configuration: {
        baseURL: this.config.baseURL || 'https://token-plan-cn.xiaomimimo.com/v1',
      },
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens,
      streaming: options?.streaming ?? true,
    })
  }

  getUsage(): UsageStats {
    return { ...this.usage }
  }

  private trackUsage(promptTokens: number, completionTokens: number, totalTokens: number): void {
    this.usage.promptTokens += promptTokens
    this.usage.completionTokens += completionTokens
    this.usage.totalTokens += totalTokens
    this.usage.requestCount += 1
  }
}

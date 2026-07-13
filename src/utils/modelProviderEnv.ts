/**
 * 从环境变量解析各 Provider 的 API Key / Base URL / 默认模型。
 * 与 ai/docs/environment-variables.md 保持一致。
 */

export type PlatformModelProvider = 'deepseek' | 'mimo' | 'openai' | 'anthropic' | 'ollama'

const ENV_API_KEYS: Record<PlatformModelProvider, string[]> = {
  deepseek: ['DEEPSEEK_API_KEY'],
  mimo: ['MIMO_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
  ollama: [],
}

const ENV_BASE_URL: Partial<Record<PlatformModelProvider, string>> = {
  deepseek: 'DEEPSEEK_BASE_URL',
  mimo: 'MIMO_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  anthropic: 'CLAUDE_BASE_URL',
}

const DEFAULT_BASE_URL: Record<PlatformModelProvider, string> = {
  deepseek: 'https://api.deepseek.com',
  mimo: 'https://token-plan-cn.xiaomimimo.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434/v1',
}

export function resolveProviderEnvApiKey(provider: string): string {
  const keys = ENV_API_KEYS[provider as PlatformModelProvider]
  if (!keys) return ''
  for (const envVar of keys) {
    const value = process.env[envVar]?.trim()
    if (value) return value
  }
  return ''
}

export function resolveProviderBaseUrl(provider: string, fallback?: string): string {
  const envVar = ENV_BASE_URL[provider as PlatformModelProvider]
  if (envVar) {
    const fromEnv = process.env[envVar]?.trim()
    if (fromEnv) return fromEnv
  }
  return fallback ?? DEFAULT_BASE_URL[provider as PlatformModelProvider] ?? ''
}

export function getProviderDefaultBaseUrl(provider: string): string {
  return DEFAULT_BASE_URL[provider as PlatformModelProvider] ?? 'https://api.deepseek.com'
}

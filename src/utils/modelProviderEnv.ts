/**
 * 从环境变量解析各 Provider 的 API Key / Base URL / 默认模型。
 *
 * 使用 convention-based 解析：{PROVIDER_UPPER}_API_KEY / {PROVIDER_UPPER}_BASE_URL
 * 同时保留已知 provider 的别名映射（如 anthropic → CLAUDE_API_KEY）。
 *
 * 新增 Provider 只需：
 * 1. 在 DB 插入 Provider 记录
 * 2. 设置环境变量 {PROVIDER_NAME}_API_KEY
 * 无需修改此文件。
 */

// ────────────────────────────────────────────
// 已知 Provider 的默认 Base URL
// 新 provider 可通过 DB Provider.baseUrl 或环境变量配置，不需要改这里
// ────────────────────────────────────────────

const DEFAULT_BASE_URL: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  mimo: 'https://api.xiaomimimo.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434/v1',
  azure: 'https://api.openai.com/v1',
  custom: '',
}

// ────────────────────────────────────────────
// 环境变量别名映射
// key = provider name (小写), value = 可能的环境变量名列表
// convention: {PROVIDER_UPPER}_API_KEY 优先，别名其次
// ────────────────────────────────────────────

const ENV_KEY_ALIASES: Record<string, string[]> = {
  deepseek: ['DEEPSEEK_API_KEY'],
  mimo: ['MIMO_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
  ollama: [],
  azure: ['AZURE_OPENAI_API_KEY'],
}

const ENV_BASE_URL_ALIASES: Record<string, string> = {
  deepseek: 'DEEPSEEK_BASE_URL',
  mimo: 'MIMO_BASE_URL',
  openai: 'OPENAI_BASE_URL',
  anthropic: 'CLAUDE_BASE_URL',
  azure: 'AZURE_OPENAI_BASE_URL',
}

// ────────────────────────────────────────────
// 解析函数
// ────────────────────────────────────────────

/**
 * 从环境变量解析 Provider 的 API Key。
 *
 * 解析顺序：
 * 1. 已知别名映射（如 anthropic → CLAUDE_API_KEY）
 * 2. Convention: {PROVIDER_UPPER}_API_KEY（如 qwen → QWEN_API_KEY）
 */
export function resolveProviderEnvApiKey(provider: string): string {
  const lower = provider.toLowerCase()

  // 1. 已知别名
  const aliases = ENV_KEY_ALIASES[lower]
  if (aliases) {
    for (const envVar of aliases) {
      const value = process.env[envVar]?.trim()
      if (value) return value
    }
  }

  // 2. Convention: {PROVIDER_UPPER}_API_KEY
  const conventionKey = `${lower.toUpperCase()}_API_KEY`
  const conventionValue = process.env[conventionKey]?.trim()
  if (conventionValue) return conventionValue

  return ''
}

/**
 * 从环境变量解析 Provider 的 Base URL。
 *
 * 解析顺序：
 * 1. 已知别名映射（如 anthropic → CLAUDE_BASE_URL）
 * 2. Convention: {PROVIDER_UPPER}_BASE_URL
 * 3. fallback 参数
 * 4. DEFAULT_BASE_URL 中的已知默认值
 */
export function resolveProviderBaseUrl(provider: string, fallback?: string): string {
  const lower = provider.toLowerCase()

  // 1. 已知别名
  const envVar = ENV_BASE_URL_ALIASES[lower]
  if (envVar) {
    const fromEnv = process.env[envVar]?.trim()
    if (fromEnv) return fromEnv
  }

  // 2. Convention: {PROVIDER_UPPER}_BASE_URL
  const conventionKey = `${lower.toUpperCase()}_BASE_URL`
  const conventionValue = process.env[conventionKey]?.trim()
  if (conventionValue) return conventionValue

  // 3. Fallback or default
  return fallback ?? DEFAULT_BASE_URL[lower] ?? ''
}

/**
 * 获取 Provider 的默认 Base URL。
 * 仅返回已知 provider 的硬编码默认值，不读取环境变量。
 * 未知 provider 返回空字符串（不兜底到 DeepSeek）。
 */
export function getProviderDefaultBaseUrl(provider: string): string {
  return DEFAULT_BASE_URL[provider.toLowerCase()] ?? ''
}

/**
 * 注册自定义 Provider 的默认 Base URL。
 * 运行时调用，用于动态注册新 provider。
 */
export function registerProviderDefaultBaseUrl(provider: string, baseUrl: string): void {
  DEFAULT_BASE_URL[provider.toLowerCase()] = baseUrl
}

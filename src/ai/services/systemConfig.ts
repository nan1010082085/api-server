/**
 * System Configuration Service
 *
 * Reads configuration from the Config collection (key = 'system_config_*').
 * Supports caching with TTL to avoid DB reads on every request.
 *
 * Usage:
 *   const keywords = await getSystemConfig<string[]>('complex_indicators', [...defaults])
 *   const toolName = await getSystemConfig<string>('rag_tool_name', 'rag__search')
 *
 * To override a config value, insert/update a document in the Config collection:
 *   { key: 'system_config_complex_indicators', value: '["联动","条件",...]', type: 'system' }
 */

const configCache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Get a system configuration value from the Config collection.
 *
 * Resolution order:
 * 1. In-memory cache (TTL 60s)
 * 2. DB Config document (key = `system_config_${key}`)
 * 3. fallback parameter
 *
 * The DB value is stored as a JSON string. If parsing fails, the raw string is returned.
 */
export async function getSystemConfig<T>(key: string, fallback: T): Promise<T> {
  const cacheKey = `system_config_${key}`
  const now = Date.now()

  // 1. Cache hit
  const cached = configCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  // 2. DB lookup
  try {
    const { ConfigModel } = await import('../../models/Config.js')
    const doc = await ConfigModel.findOne({ key: cacheKey, status: 'active' }).lean() as Record<string, unknown> | null
    if (doc?.value) {
      let parsed: unknown
      try {
        parsed = JSON.parse(doc.value as string)
      } catch {
        parsed = doc.value
      }
      configCache.set(cacheKey, { value: parsed, expiresAt: now + CACHE_TTL_MS })
      return parsed as T
    }
  } catch {
    // Config collection may not exist yet — use fallback
  }

  // 3. Fallback (also cache it to avoid repeated DB misses)
  configCache.set(cacheKey, { value: fallback, expiresAt: now + CACHE_TTL_MS })
  return fallback
}

/**
 * Clear the config cache. Useful after updating config values.
 */
export function clearSystemConfigCache(): void {
  configCache.clear()
}

// ────────────────────────────────────────────
// Well-known config keys with defaults
// ────────────────────────────────────────────

/** Keywords that indicate complex task generation (Chinese) */
export const DEFAULT_COMPLEX_INDICATORS = [
  '联动', '条件', '动态', '多步', '复杂',
  '同时', '并且', '然后', '之后',
  '审批', '流程', '表单',
  '会签', '或签', '分支',
]

/** Agent descriptions for router node */
export const DEFAULT_AGENT_DESCRIPTIONS: Record<string, string> = {
  page: '生成页面',
  editor: '生成表单',
  flow: '生成流程',
}

/** RAG tool name for knowledge base search */
export const DEFAULT_RAG_TOOL_NAME = 'rag__search'

/**
 * Get complex task indicators (configurable via DB).
 * DB key: system_config_complex_indicators
 * Value: JSON array of strings
 */
export async function getComplexIndicators(): Promise<string[]> {
  return getSystemConfig<string[]>('complex_indicators', DEFAULT_COMPLEX_INDICATORS)
}

/**
 * Get agent descriptions for router (configurable via DB).
 * DB key: system_config_agent_descriptions
 * Value: JSON object { agentName: description }
 */
export async function getAgentDescriptions(): Promise<Record<string, string>> {
  return getSystemConfig<Record<string, string>>('agent_descriptions', DEFAULT_AGENT_DESCRIPTIONS)
}

/**
 * Get RAG tool name (configurable via DB).
 * DB key: system_config_rag_tool_name
 * Value: string
 */
export async function getRagToolName(): Promise<string> {
  return getSystemConfig<string>('rag_tool_name', DEFAULT_RAG_TOOL_NAME)
}

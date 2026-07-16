/**
 * AI Module — Centralized Configuration
 *
 * All configurable thresholds, limits, and defaults in one place.
 * Values are read from environment variables with sensible fallbacks.
 *
 * To override: set the corresponding env var in .env.production.
 * Example: AI_LLM_TIMEOUT_MS=180000
 */

// ────────────────────────────────────────────
// LLM Timeouts & Retries
// ────────────────────────────────────────────

/** LLM request timeout in milliseconds */
export const LLM_TIMEOUT_MS = intEnv('AI_LLM_TIMEOUT_MS', 120_000)

/** Max retries for transient LLM errors (429, 5xx) */
export const LLM_MAX_RETRIES = intEnv('AI_LLM_MAX_RETRIES', 3)

/** Base delay for exponential backoff (ms) */
export const LLM_RETRY_BASE_DELAY_MS = intEnv('AI_RETRY_BASE_DELAY_MS', 1000)

/** Max retries for streaming LLM calls */
export const LLM_STREAM_MAX_RETRIES = intEnv('AI_STREAM_MAX_RETRIES', 2)

// ────────────────────────────────────────────
// Token Budgets
// ────────────────────────────────────────────

/** Token budget for conversation history (non-graph path) */
export const HISTORY_TOKEN_BUDGET = intEnv('AI_HISTORY_TOKEN_BUDGET', 4000)

/** Token budget for LangGraph agent nodes */
export const LANGGRAPH_HISTORY_TOKEN_BUDGET = intEnv('AI_LANGGRAPH_TOKEN_BUDGET', 60_000)

/** Minimum number of recent messages to always keep */
export const MIN_KEEP_MESSAGES = intEnv('AI_MIN_KEEP_MESSAGES', 4)

/** Max characters for assistant message content in history */
export const MAX_ASSISTANT_CONTENT_CHARS = intEnv('AI_MAX_ASSISTANT_CONTENT', 2000)

// ────────────────────────────────────────────
// Conversation Summary
// ────────────────────────────────────────────

/** Message count threshold to trigger summary generation */
export const SUMMARY_THRESHOLD = intEnv('AI_SUMMARY_THRESHOLD', 20)

/** Number of recent messages to keep after summary */
export const SUMMARY_KEEP_RECENT = intEnv('AI_SUMMARY_KEEP_RECENT', 6)

// ────────────────────────────────────────────
// File Processing
// ────────────────────────────────────────────

/** Max file upload size in bytes (default 10MB) */
export const MAX_FILE_SIZE = intEnv('AI_MAX_FILE_SIZE_MB', 10) * 1024 * 1024

// ────────────────────────────────────────────
// Tool Execution
// ────────────────────────────────────────────

/** Max tool iteration loops before forced stop */
export const MAX_TOOL_ITERATIONS = intEnv('AI_MAX_TOOL_ITERATIONS', 3)

// ────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────

/** Default LLM temperature */
export const DEFAULT_TEMPERATURE = floatEnv('AI_DEFAULT_TEMPERATURE', 0.7)

/** Default LLM max tokens */
export const DEFAULT_MAX_TOKENS = intEnv('AI_DEFAULT_MAX_TOKENS', 8192)

/** Default model when nothing else resolves */
export const DEFAULT_FALLBACK_MODEL = process.env.AI_DEFAULT_MODEL || 'deepseek-v4-flash'

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

function floatEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

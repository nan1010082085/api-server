/**
 * Plugin Metrics Collector.
 *
 * Provides utility functions for recording plugin execution metrics.
 * Follows the same pattern as executeWithMetrics in graph/agentBase.ts.
 */

import { PluginMetricModel, type PluginType } from '../models/pluginMetric.js'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface RecordPluginMetricOptions {
  pluginId: string
  pluginName?: string
  pluginType: PluginType
  duration: number
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
}

// ────────────────────────────────────────────
// Collector
// ────────────────────────────────────────────

/**
 * Record a single plugin execution metric.
 */
export async function recordPluginMetric(options: RecordPluginMetricOptions): Promise<void> {
  try {
    await PluginMetricModel.create({
      pluginId: options.pluginId,
      pluginName: options.pluginName ?? '',
      pluginType: options.pluginType,
      duration: options.duration,
      success: options.success,
      error: options.error,
      metadata: options.metadata,
    })
  } catch (err) {
    // Metrics recording should never break the main flow
    console.error('[pluginMetrics] Failed to record metric:', err)
  }
}

/**
 * Execute a function with plugin metrics recording.
 *
 * Records duration, success/failure, and error details.
 * Follows the same pattern as executeWithMetrics in agentBase.ts.
 */
export async function executeWithPluginMetrics<T>(
  pluginId: string,
  pluginType: PluginType,
  fn: () => Promise<T>,
  options?: { pluginName?: string; metadata?: Record<string, unknown> },
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start

    await recordPluginMetric({
      pluginId,
      pluginName: options?.pluginName,
      pluginType,
      duration,
      success: true,
      metadata: options?.metadata,
    })

    return result
  } catch (err) {
    const duration = Date.now() - start
    const error = err instanceof Error ? err.message : String(err)

    await recordPluginMetric({
      pluginId,
      pluginName: options?.pluginName,
      pluginType,
      duration,
      success: false,
      error,
      metadata: options?.metadata,
    })

    throw err
  }
}

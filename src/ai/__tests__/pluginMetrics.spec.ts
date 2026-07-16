/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../models/pluginMetric.js', () => ({
  PluginMetricModel: {
    create: vi.fn().mockResolvedValue({ _id: 'mock-id' }),
  },
}))

import { recordPluginMetric, executeWithPluginMetrics } from '../services/pluginMetrics.js'
import { PluginMetricModel } from '../models/pluginMetric.js'

describe('recordPluginMetric', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records a successful metric', async () => {
    await recordPluginMetric({
      pluginId: 'test-plugin',
      pluginName: 'Test Plugin',
      pluginType: 'expert',
      duration: 150,
      success: true,
    })

    expect(PluginMetricModel.create).toHaveBeenCalledWith({
      pluginId: 'test-plugin',
      pluginName: 'Test Plugin',
      pluginType: 'expert',
      duration: 150,
      success: true,
      error: undefined,
      metadata: undefined,
    })
  })

  it('records a failed metric with error', async () => {
    await recordPluginMetric({
      pluginId: 'test-plugin',
      pluginType: 'tool',
      duration: 300,
      success: false,
      error: 'Tool execution failed',
    })

    expect(PluginMetricModel.create).toHaveBeenCalledWith({
      pluginId: 'test-plugin',
      pluginName: '',
      pluginType: 'tool',
      duration: 300,
      success: false,
      error: 'Tool execution failed',
      metadata: undefined,
    })
  })

  it('handles recording errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(PluginMetricModel.create).mockRejectedValueOnce(new Error('DB error'))

    await recordPluginMetric({
      pluginId: 'test-plugin',
      pluginType: 'mcp',
      duration: 100,
      success: true,
    })

    expect(consoleSpy).toHaveBeenCalledWith('[pluginMetrics] Failed to record metric:', expect.any(Error))
    consoleSpy.mockRestore()
  })
})

describe('executeWithPluginMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records successful execution', async () => {
    const mockFn = vi.fn().mockResolvedValue('result')

    const result = await executeWithPluginMetrics('test-plugin', 'expert', mockFn)

    expect(result).toBe('result')
    expect(mockFn).toHaveBeenCalledOnce()
    expect(PluginMetricModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'test-plugin',
        pluginType: 'expert',
        success: true,
      }),
    )
  })

  it('records failed execution and rethrows error', async () => {
    const error = new Error('Test error')
    const mockFn = vi.fn().mockRejectedValue(error)

    await expect(executeWithPluginMetrics('test-plugin', 'tool', mockFn)).rejects.toThrow('Test error')
    expect(mockFn).toHaveBeenCalledOnce()
    expect(PluginMetricModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'test-plugin',
        pluginType: 'tool',
        success: false,
        error: 'Test error',
      }),
    )
  })

  it('includes plugin name and metadata', async () => {
    const mockFn = vi.fn().mockResolvedValue('result')

    await executeWithPluginMetrics('test-plugin', 'skill', mockFn, {
      pluginName: 'My Skill',
      metadata: { conversationId: 'conv-123' },
    })

    expect(PluginMetricModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'test-plugin',
        pluginName: 'My Skill',
        pluginType: 'skill',
        metadata: { conversationId: 'conv-123' },
      }),
    )
  })
})

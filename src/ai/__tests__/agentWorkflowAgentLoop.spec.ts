/**
 * agent-loop 节点自主循环逻辑测试
 */
/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIMessage } from '@langchain/core/messages'

vi.mock('../models/agentWorkflow.js', () => ({
  AgentWorkflowExecutionModel: {
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../utils/leanDoc.js', () => ({ leanDoc: vi.fn((d) => d) }))

vi.mock('@schema-platform/platform-shared/ai/toolNames', () => ({
  normalizeToolName: vi.fn((n: string) => n),
  REQUIREMENT_ANALYZER_TOOLS_PROMPT: 'requirement tools prompt',
}))

vi.mock('../tools/registry.js', () => ({
  getToolSync: vi.fn(),
  ensureToolsReady: vi.fn().mockResolvedValue(undefined),
  getToolsByNames: vi.fn().mockReturnValue([]),
  isHttpTool: vi.fn().mockReturnValue(false),
}))

vi.mock('../tools/httpToolExecutor.js', () => ({
  executeHttpRequest: vi.fn(),
}))

vi.mock('../plugins/index.js', () => ({
  getPluginRegistry: vi.fn().mockReturnValue({
    matchExpertsByRouting: vi.fn().mockReturnValue([]),
    getExpert: vi.fn().mockReturnValue(undefined),
    getExpertByLegacyKey: vi.fn().mockReturnValue(undefined),
    listExperts: vi.fn().mockReturnValue([]),
  }),
}))

vi.mock('../services/llmCache.js', () => ({ getLLM: vi.fn() }))

vi.mock('../../socket.js', () => ({ getIO: vi.fn().mockReturnValue(null) }))

vi.mock('@schema-platform/platform-shared/ai/promptBuilder', () => ({
  ROUTER_SYSTEM_PROMPT: 'router',
}))

import { runAgentLoop, type AgentLoopLLM } from '../services/agentWorkflowExecutor.js'

function makeCtx() {
  return {
    executionId: 'exec-1',
    triggeredBy: 'manual',
    input: { message: '帮我查天气' },
    lastOutput: null,
    nodeOutputs: {},
    conversationHistory: [],
  }
}

function makeLLM(responses: Array<{ tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>; content?: string }>): AgentLoopLLM {
  let i = 0
  return {
    async invoke() {
      const r = responses[i++] ?? { content: '完成' }
      return new AIMessage({
        content: r.content ?? '',
        tool_calls: r.tool_calls as never,
      }) as unknown as Awaited<ReturnType<AgentLoopLLM['invoke']>>
    },
  }
}

describe('runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无工具调用时单轮返回文本', async () => {
    const llm = makeLLM([{ content: '直接回答' }])
    const result = await runAgentLoop({
      boundLlm: llm,
      system: 'sys',
      userInput: 'hi',
      maxIterations: 5,
      ctx: makeCtx() as never,
      nodeId: 'n1',
      nodeType: 'agent-loop',
    })
    expect(result.iterations).toBe(1)
    expect(result.text).toBe('直接回答')
    expect(result.toolInvocations).toBe(0)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].toolCalls).toHaveLength(0)
  })

  it('迭代上限内完成：先调工具再给文本', async () => {
    const llm = makeLLM([
      { tool_calls: [{ id: 'tc1', name: 'weather__search', args: { city: '北京' } }] },
      { content: '北京今天晴' },
    ])
    const result = await runAgentLoop({
      boundLlm: llm,
      system: 'sys',
      userInput: '查天气',
      maxIterations: 5,
      ctx: makeCtx() as never,
      nodeId: 'n1',
      nodeType: 'agent-loop',
    })
    expect(result.iterations).toBe(2)
    expect(result.text).toBe('北京今天晴')
  })

  it('达迭代上限时返回提示文本', async () => {
    const llm = makeLLM([
      { tool_calls: [{ id: 'tc1', name: 't', args: {} }] },
      { tool_calls: [{ id: 'tc2', name: 't', args: {} }] },
      { tool_calls: [{ id: 'tc3', name: 't', args: {} }] },
    ])
    const result = await runAgentLoop({
      boundLlm: llm,
      system: 'sys',
      userInput: '无限循环',
      maxIterations: 3,
      ctx: makeCtx() as never,
      nodeId: 'n1',
      nodeType: 'agent-loop',
    })
    expect(result.iterations).toBe(3)
    expect(result.text).toContain('最大迭代次数')
  })

  it('跳过无效 tool_call（无 id）继续循环', async () => {
    const llm = makeLLM([
      { tool_calls: [{ id: '', name: 't', args: {} }] },
      { content: '完成' },
    ])
    const result = await runAgentLoop({
      boundLlm: llm,
      system: 'sys',
      userInput: 'hi',
      maxIterations: 5,
      ctx: makeCtx() as never,
      nodeId: 'n1',
      nodeType: 'agent-loop',
    })
    expect(result.text).toBe('完成')
  })
})

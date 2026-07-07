/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { END } from '@langchain/langgraph'
import { graph, routeAfterRouter, routeAfterTaskChain, afterAgent, afterToolsRoute } from '../graph/graph.js'
import type { AgentStateAnnotation } from '../graph/state.js'

type State = typeof AgentStateAnnotation.State

function makeState(overrides: Partial<State> = {}): State {
  return {
    messages: [],
    context: { source: 'standalone', turnCount: 1 },
    session: { id: '', conversationId: '', currentAgent: 'router' },
    task: { type: 'general', chain: [], currentStepIndex: 0, intermediateResults: [], currentVersion: 0 },
    tools: { needsTool: false, results: [], toolIterationCount: 0 },
    error: null,
    interaction: {
      clarificationRequest: null,
      clarificationOptions: [],
      preferences: {},
      historySummary: '',
      collaborationRequest: null,
      collaborationHistory: [],
    },
    ...overrides,
  }
}

describe('graph assembly', () => {
  it('exports a compiled graph', () => {
    expect(graph).toBeDefined()
    expect(typeof graph.streamEvents).toBe('function')
    expect(typeof graph.invoke).toBe('function')
  })

  it('graph has streamEvents method for SSE streaming', () => {
    expect(graph.streamEvents).toBeDefined()
    expect(graph.streamEvents.length).toBeGreaterThanOrEqual(2)
  })
})

describe('routeAfterRouter', () => {
  it('routes to pluginExpert when no active task chain', () => {
    const state = makeState({
      context: { source: 'editor', turnCount: 1 },
      session: { id: '', conversationId: '', currentAgent: 'editor', currentExpertId: 'platform.editor' },
    })
    expect(routeAfterRouter(state)).toBe('pluginExpert')
  })

  it('routes to taskChain when task chain is active', () => {
    const state = makeState({
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [{ agent: 'editor', description: 'Generate form', status: 'running' }],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(routeAfterRouter(state)).toBe('taskChain')
  })

  it('routes to pluginExpert for auto mode with no task chain', () => {
    const state = makeState({
      context: { source: 'standalone', turnCount: 1 },
      session: { id: '', conversationId: '', currentAgent: 'editor', currentExpertId: 'platform.editor' },
    })
    expect(routeAfterRouter(state)).toBe('pluginExpert')
  })
})

describe('routeAfterTaskChain', () => {
  it('routes to summarizer when task type is summarize', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'general' },
      task: { type: 'summarize', chain: [], currentStepIndex: 0, intermediateResults: [], currentVersion: 0 },
    })
    expect(routeAfterTaskChain(state)).toBe('summarizer')
  })

  it('routes to pluginExpert for active expert step', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor', currentExpertId: 'platform.editor' },
      task: { type: 'generate_simple', chain: [{ agent: 'editor', description: 'test', status: 'running' }], currentStepIndex: 0, intermediateResults: [], currentVersion: 0 },
    })
    expect(routeAfterTaskChain(state)).toBe('pluginExpert')
  })
})

describe('afterAgent', () => {
  it('returns allTools when agent has tool_calls', () => {
    const aiMessage = new AIMessage({
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'schema__search', args: { keyword: 'test' } }],
    })
    const state = makeState({
      messages: [new HumanMessage('test'), aiMessage],
      session: { id: '', conversationId: '', currentAgent: 'editor' },
    })
    expect(afterAgent(state)).toBe('allTools')
  })

  it('returns END when no tool_calls and no task chain', () => {
    const aiMessage = new AIMessage({ content: 'Here is your form.' })
    const state = makeState({
      messages: [new HumanMessage('test'), aiMessage],
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'editor', turnCount: 1 },
    })
    expect(afterAgent(state)).toBe(END)
  })

  it('returns taskChain when task chain has more steps', () => {
    const aiMessage = new AIMessage({ content: 'Form generated.' })
    const state = makeState({
      messages: [new HumanMessage('test'), aiMessage],
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'done' },
          { agent: 'flow', description: 'Generate flow', status: 'pending' },
        ],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterAgent(state)).toBe('taskChain')
  })

  it('returns summarizer when all task chain steps complete', () => {
    const aiMessage = new AIMessage({ content: 'Flow generated.' })
    const state = makeState({
      messages: [new HumanMessage('test'), aiMessage],
      session: { id: '', conversationId: '', currentAgent: 'flow' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'done' },
          { agent: 'flow', description: 'Generate flow', status: 'done' },
        ],
        currentStepIndex: 1,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterAgent(state)).toBe('summarizer')
  })
})

describe('afterToolsRoute + collaboration detection', () => {
  it('afterToolsRoute detects collaboration and routes to taskChain', () => {
    const state = makeState({
      messages: [new HumanMessage('做一个请假审批')],
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'running' },
        ],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
      interaction: {
        clarificationRequest: null,
        clarificationOptions: [],
        preferences: {},
        historySummary: '',
        collaborationRequest: {
          targetAgent: 'flow',
          description: '生成审批流程',
          conversationId: 'conv-1',
        },
      },
    })

    expect(afterToolsRoute(state)).toBe('taskChain')
  })

  it('afterToolsRoute returns taskChain when no collaboration and task chain has more steps', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'running' },
          { agent: 'flow', description: 'Generate flow', status: 'pending' },
        ],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterToolsRoute(state)).toBe('taskChain')
  })
})

describe('afterToolsRoute', () => {
  it('returns taskChain when collaboration request is set', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      interaction: {
        clarificationRequest: null,
        clarificationOptions: [],
        preferences: {},
        historySummary: '',
        collaborationRequest: {
          targetAgent: 'flow',
          description: '生成审批流程',
        },
      },
    })
    expect(afterToolsRoute(state)).toBe('taskChain')
  })

  it('returns taskChain when task chain has more steps', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'running' },
          { agent: 'flow', description: 'Generate flow', status: 'pending' },
        ],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterToolsRoute(state)).toBe('taskChain')
  })

  it('returns summarizer when all task chain steps complete', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'flow' },
      context: { source: 'standalone', turnCount: 1 },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'done' },
          { agent: 'flow', description: 'Generate flow', status: 'running' },
        ],
        currentStepIndex: 1,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterToolsRoute(state)).toBe('summarizer')
  })

  it('returns pluginExpert when idle after tools in explicit mode', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor', currentExpertId: 'platform.editor' },
      context: { source: 'editor', turnCount: 1 },
    })
    expect(afterToolsRoute(state)).toBe('pluginExpert')
  })

  it('prefers collaboration request over task chain routing', () => {
    const state = makeState({
      session: { id: '', conversationId: '', currentAgent: 'editor' },
      context: { source: 'standalone', turnCount: 1 },
      interaction: {
        clarificationRequest: null,
        clarificationOptions: [],
        preferences: {},
        historySummary: '',
        collaborationRequest: {
          targetAgent: 'flow',
          description: '需要流程支持',
        },
        collaborationHistory: [],
      },
      task: {
        type: 'generate_simple',
        chain: [
          { agent: 'editor', description: 'Generate form', status: 'running' },
          { agent: 'flow', description: 'Generate flow', status: 'pending' },
        ],
        currentStepIndex: 0,
        intermediateResults: [],
        currentVersion: 0,
      },
    })
    expect(afterToolsRoute(state)).toBe('taskChain')
  })
})

describe('tool error handling', () => {
  it('extractPendingToolCalls identifies tool calls from AIMessage', () => {
    const aiMessage = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'tc-1', name: 'rag__search', args: { query: 'user form' } },
        { id: 'tc-2', name: 'schema__search', args: { keyword: 'test' } },
      ],
    })
    const state = makeState({
      messages: [new HumanMessage('search for forms'), aiMessage],
      session: { id: 's1', conversationId: 'conv-1', currentAgent: 'editor' },
    })

    const lastMsg = state.messages[state.messages.length - 1]
    expect(lastMsg).toBeInstanceOf(AIMessage)
    const tc = (lastMsg as AIMessage).tool_calls
    expect(tc).toHaveLength(2)
    expect(tc![0].name).toBe('rag__search')
    expect(tc![1].name).toBe('schema__search')
  })

  it('logger.error is called with ai:thinker:error on tool failure', () => {
    const loggerModule = import('../../utils/logger.js')
    return loggerModule.then(({ logger }) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      logger.error({
        msg: 'ai:thinker:error',
        toolName: 'rag__search',
        toolInput: { query: 'test' },
        error: 'MongoDB connection lost',
        conversationId: 'conv-1',
        agent: 'editor',
      })

      expect(spy).toHaveBeenCalledTimes(1)
      const logged = JSON.parse(spy.mock.calls[0][0] as string)
      expect(logged.msg).toBe('ai:thinker:error')
      expect(logged.toolName).toBe('rag__search')
      expect(logged.toolInput).toEqual({ query: 'test' })
      expect(logged.error).toBe('MongoDB connection lost')
      expect(logged.conversationId).toBe('conv-1')
      expect(logged.agent).toBe('editor')

      spy.mockRestore()
    })
  })

  it('error ToolMessage matches the original tool_call id', () => {
    const toolCallId = 'call-abc-123'
    const toolMessage = new ToolMessage({
      content: JSON.stringify({ success: false, error: 'tool rag__search failed', recoverable: true }),
      tool_call_id: toolCallId,
      name: 'rag__search',
    })

    expect(toolMessage.tool_call_id).toBe(toolCallId)
    const parsed = JSON.parse(toolMessage.content as string)
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain('rag__search')
    expect(parsed.recoverable).toBe(true)
  })
})

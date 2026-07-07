/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPluginRegistry, resetPluginRegistry } from '../plugins/index.js'
import { resolveExpertForSession, sessionForAgent } from '../graph/resolveGraphExpert.js'
import { buildExpertUserContent } from '../graph/expertUserContext.js'
import type { AgentStateAnnotation } from '../graph/state.js'

const configDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../config',
)

type State = typeof AgentStateAnnotation.State

function baseState(overrides: Partial<State> = {}): State {
  return {
    messages: [],
    context: { source: 'editor', turnCount: 1, currentSchema: [{ type: 'input', id: 'w1', field: 'name', label: '姓名' }] },
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
  } as State
}

describe('resolveGraphExpert', () => {
  beforeEach(() => {
    resetPluginRegistry()
    process.env.AI_PLUGIN_CONFIG_DIR = configDir
    delete process.env.AI_PLUGIN_CONFIG_PATH
    loadPluginRegistry()
  })

  it('resolves built-in expert by legacy agent key', () => {
    const expert = resolveExpertForSession({ currentAgent: 'editor' })
    expect(expert?.id).toBe('platform.editor')
  })

  it('syncs session with expert id for legacy agent', () => {
    const session = sessionForAgent(
      { id: 's1', conversationId: 'c1', currentAgent: 'router' },
      'flow',
    )
    expect(session.currentAgent).toBe('flow')
    expect(session.currentExpertId).toBe('platform.flow')
  })

  it('builds schema-aware user content for editor expert', () => {
    const expert = resolveExpertForSession({ currentAgent: 'editor' })
    expect(expert).toBeDefined()
    const state = baseState({
      messages: [{ constructor: { name: 'HumanMessage' }, content: '生成表单' } as never],
    })
    const content = buildExpertUserContent(state, expert!)
    expect(content).toContain('生成表单')
    expect(content).toContain('update_schema')
  })
})

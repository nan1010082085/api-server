/**
 * 工具注册表集成测试 — 验证 MCP 桥接 + LangGraph 专有工具合并。
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest'
import {
  ensureToolsReady,
  getAllToolsSync,
  getToolSync,
  isMcpTool,
  isLanggraphOnlyTool,
} from '../tools/registry.js'
import {
  SCHEMA_SEARCH,
  RAG_SEARCH,
  UPDATE_SCHEMA,
  INDUSTRY_SEARCH_TEMPLATES,
} from '@schema-platform/ai-shared/toolNames'

describe('tools registry', () => {
  it('initializes MCP bridge and langgraph-only tools', async () => {
    await ensureToolsReady()
    const tools = getAllToolsSync()
    expect(tools.length).toBeGreaterThan(0)

    const names = tools.map((t) => t.name)
    expect(names).toContain(SCHEMA_SEARCH)
    expect(names).toContain(RAG_SEARCH)
    expect(names).toContain(UPDATE_SCHEMA)
    expect(names).toContain(INDUSTRY_SEARCH_TEMPLATES)
  })

  it('getToolSync returns MCP and langgraph tools', async () => {
    await ensureToolsReady()
    expect(getToolSync(SCHEMA_SEARCH)).toBeDefined()
    expect(getToolSync(RAG_SEARCH)).toBeDefined()
    expect(getToolSync(UPDATE_SCHEMA)).toBeDefined()
    expect(isMcpTool(SCHEMA_SEARCH)).toBe(true)
    expect(isLanggraphOnlyTool(UPDATE_SCHEMA)).toBe(true)
  })

  it('getToolSync returns schema search tool definition', async () => {
    await ensureToolsReady()
    const tool = getToolSync(SCHEMA_SEARCH)
    expect(tool).toBeDefined()
    expect(tool!.name).toBe(SCHEMA_SEARCH)
  })
})

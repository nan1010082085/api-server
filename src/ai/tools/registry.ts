/**
 * 工具注册表 — 统一管理 MCP 桥接工具和 LangGraph 专有工具。
 *
 * 启动时调用 initMcpBridge() 加载所有 MCP Server 工具，合并 LangGraph 专有工具，
 * 形成全局唯一的工具注册表。graph.ts / requirementAnalyzer.ts / Agent 节点
 * 均通过此注册表获取工具，确保「MCP 作为权威工具源」单一入口。
 *
 * 初始化策略：模块加载时顶层 await，确保任何 import 此模块的代码在工具就绪后运行。
 * 任一 MCP Server 失败由 bridge 层降级处理，不影响整体注册。
 */

import type { StructuredTool } from '@langchain/core/tools'
import { initPluginRegistry, getPluginRegistry } from '../plugins/registrySingleton.js'
import { initMcpBridge } from '../mcp/bridge.js'
import { langgraphOnlyTools, LANGGRAPH_ONLY_TOOL_NAMES } from './langgraphTools.js'
import { buildHttpStructuredTool } from './httpToolExecutor.js'

function loadHttpToolsFromRegistry(): StructuredTool[] {
  return getPluginRegistry()
    .listToolDeclarations()
    .filter((t) => t.kind === 'http')
    .map((t) => buildHttpStructuredTool(t.name, t.description))
}

// ────────────────────────────────────────────
// 状态
// ────────────────────────────────────────────

let _allTools: StructuredTool[] = []
let _toolMap: Map<string, StructuredTool> = new Map()
let _ready = false

const _readyPromise: Promise<void> = (async () => {
  try {
    initPluginRegistry()
    const mcpTools = await initMcpBridge()
    const httpTools = loadHttpToolsFromRegistry()
    _allTools = [...mcpTools, ...langgraphOnlyTools, ...httpTools]
    _toolMap = new Map(_allTools.map((t) => [t.name, t]))
    _ready = true
  } catch (err) {
    // 桥接完全失败时退化为仅 LangGraph 专有工具，保证 Chat 可降级
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[toolsRegistry] init failed, falling back to langgraph-only tools: ${message}`)
    _allTools = [...langgraphOnlyTools, ...loadHttpToolsFromRegistry()]
    _toolMap = new Map(_allTools.map((t) => [t.name, t]))
    _ready = true
  }
})()

// ────────────────────────────────────────────
// 公共 API
// ────────────────────────────────────────────

/** 等待工具注册表就绪。多次调用安全（复用同一 promise）。 */
export function ensureToolsReady(): Promise<void> {
  return _readyPromise
}

/** 工具是否已初始化。 */
export function isToolsReady(): boolean {
  return _ready
}

/** 获取所有工具（MCP + LangGraph 专有）。未就绪时抛错。 */
export function getAllToolsSync(): StructuredTool[] {
  if (!_ready) {
    throw new Error('[toolsRegistry] tools not ready. Await ensureToolsReady() first.')
  }
  return _allTools
}

/** 按名获取单个工具。未就绪或不存在返回 undefined。 */
export function getToolSync(name: string): StructuredTool | undefined {
  if (!_ready) return undefined
  return _toolMap.get(name)
}

/** 按名批量获取工具，跳过未找到的。 */
export function getToolsByNames(names: string[]): StructuredTool[] {
  if (!_ready) return []
  return names
    .map((n) => _toolMap.get(n))
    .filter((t): t is StructuredTool => t !== undefined)
}

/** 判断工具名是否属于 LangGraph 专有（非 MCP）。 */
export function isLanggraphOnlyTool(name: string): boolean {
  return LANGGRAPH_ONLY_TOOL_NAMES.has(name)
}

/** 判断工具名是否属于 Registry 声明的 HTTP 工具。 */
export function isHttpTool(name: string): boolean {
  return getPluginRegistry().getToolDeclaration(name)?.kind === 'http'
}

/** 判断工具名是否属于 MCP 桥接工具。 */
export function isMcpTool(name: string): boolean {
  return _ready && _toolMap.has(name) && !LANGGRAPH_ONLY_TOOL_NAMES.has(name) && !isHttpTool(name)
}

/**
 * 热重载：重建 Registry 与 MCP / HTTP 工具表。
 * 调用方须先 resetPluginRegistry()，或由 reloadPluginCenter() 统一编排。
 */
export async function reloadToolsRegistry(): Promise<{ toolCount: number }> {
  initPluginRegistry()
  try {
    const mcpTools = await initMcpBridge()
    const httpTools = loadHttpToolsFromRegistry()
    _allTools = [...mcpTools, ...langgraphOnlyTools, ...httpTools]
    _toolMap = new Map(_allTools.map((t) => [t.name, t]))
    _ready = true
    return { toolCount: _allTools.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[toolsRegistry] reload failed, falling back to langgraph-only tools: ${message}`)
    _allTools = [...langgraphOnlyTools, ...loadHttpToolsFromRegistry()]
    _toolMap = new Map(_allTools.map((t) => [t.name, t]))
    _ready = true
    return { toolCount: _allTools.length }
  }
}

// ────────────────────────────────────────────
// 顶层 await：模块加载时完成初始化
// ────────────────────────────────────────────

await _readyPromise

export { langgraphOnlyTools }

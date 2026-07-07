/**
 * 插件中心类型 — Expert / Skill / Tool / MCP 四层能力声明。
 * 配置来源：ai-plugins.builtin.json + 可选覆盖文件（见 loadPluginConfig）。
 */

export type PluginRuntime = 'langgraph' | 'workflow'

export type ToolKind = 'mcp' | 'graph' | 'http'

export type McpTransport = 'inmemory' | 'stdio' | 'sse'

/** LangGraph 路由用 legacy 键，与 graph 节点名 / session.currentAgent 对齐 */
export type LegacyAgentKey = 'editor' | 'flow' | 'page' | 'general' | 'router'

export interface PluginToolDeclaration {
  name: string
  kind: ToolKind
  description?: string
  /** graph 工具由 langgraphTools 提供；mcp 由 MCP Server 发现 */
  source?: string
}

export interface McpServerDeclaration {
  id: string
  transport: McpTransport
  /** inmemory 内置域：schema | flow | widget | rag | industry */
  builtin?: string
  /** stdio */
  command?: string
  args?: string[]
  /** sse */
  url?: string
  headers?: Record<string, string>
  namespace?: string
  enabled?: boolean
}

export interface SkillDeclaration {
  id: string
  label: string
  /** 内联 Markdown */
  content?: string
  /** 相对 AI_PLUGIN_CONFIG_DIR 或配置文件所在目录 */
  file?: string
  tools?: string[]
  enabled?: boolean
}

export interface ExpertRoutingDeclaration {
  keywords?: string[]
  contextSources?: Array<'editor' | 'flow' | 'page' | 'standalone'>
  priority?: number
}

export interface ExpertModelDeclaration {
  temperature?: number
  maxTokens?: number
  /** 对齐 getModelForTask 任务名 */
  task?: string
}

export interface ExpertDeclaration {
  id: string
  label: string
  description?: string
  /** 与 LangGraph session.currentAgent / 工作流 agentType 对齐 */
  legacyAgentKey?: LegacyAgentKey
  /** 运行时从 promptBuilder 生成（editor/flow/page/general） */
  dynamicPrompt?: 'editor' | 'flow' | 'page' | 'general'
  systemPrompt?: string
  skills?: string[]
  tools: string[]
  routing?: ExpertRoutingDeclaration
  model?: ExpertModelDeclaration
  runtime?: PluginRuntime[]
  enabled?: boolean
}

export interface PluginManifest {
  version: number
  mcpServers?: McpServerDeclaration[]
  tools?: PluginToolDeclaration[]
  skills?: SkillDeclaration[]
  experts?: ExpertDeclaration[]
}

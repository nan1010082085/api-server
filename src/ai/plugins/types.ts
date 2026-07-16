/**
 * 插件中心类型 — Expert / Skill / Tool / MCP 四层能力声明。
 * 配置来源：config/plugins/ 分目录（见 loadPluginConfig）。
 */

export type PluginRuntime = 'langgraph' | 'workflow'

export type ToolKind = 'mcp' | 'graph' | 'http'

export type McpTransport = 'inmemory' | 'stdio' | 'sse'

export type PluginToolCategory =
  | 'mcp-schema'
  | 'mcp-flow'
  | 'mcp-widget'
  | 'mcp-rag'
  | 'mcp-industry'
  | 'langgraph'
  | 'workflow'

/**
 * Task chain 调度键（固定枚举，不可扩展）。
 * 用途：taskPlanner 生成任务链时作为 step.agent 的值；LangGraph router 按此写入 session.currentAgent。
 * 不是图节点名，不是 Expert ID。参见 plugin.md#legacyagentkey-说明。
 */
export type LegacyAgentKey = 'editor' | 'flow' | 'page' | 'general' | 'router'

export interface PluginToolDeclaration {
  name: string
  kind: ToolKind
  /** 前端 Plugin Center / 设计器展示名 */
  label?: string
  /** 设计器 Palette 分组，如 mcp-schema / langgraph */
  category?: PluginToolCategory
  description?: string
  /** JSON 参数示例，供设计器 ToolNodePanel 展示 */
  argsHint?: string
  /** graph 工具由 langgraphTools 提供；mcp 由 MCP Server 发现 */
  source?: string
}

export interface McpServerDeclaration {
  id: string
  transport: McpTransport
  /** inmemory 内置域：schema | flow | widget | rag | industry */
  builtin?: string
  /** inmemory 自定义工厂模块（相对 server 根或绝对路径） */
  factoryModule?: string
  /** factoryModule 导出的工厂函数名，默认 createMcpServer */
  factoryExport?: string
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
  /** 语言标签（如 zh / en），缺省为默认语言 */
  locale?: string
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
  /**
   * Task chain 调度键 — 用于 taskPlanner 任务链步骤路由、LangGraph session.currentAgent 回退查找。
   * 非图节点 ID，非 Expert 唯一标识（id 才是）。
   * 仅当 Expert 需要参与 task chain 或被 router 意图匹配调度时才需要设置。
   * @see plugin.md#legacyagentkey-说明
   */
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

/** 插件包根 manifest.json（pack / install 用） */
export interface PluginPackManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** HMAC-SHA256 签名（base64），由 plugin:pack 自动生成 */
  signature?: string
  /** 签名时间（ISO 8601），由 plugin:pack 自动生成 */
  signedAt?: string
}

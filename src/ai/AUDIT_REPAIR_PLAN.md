# AI 项目 10 维审计修复方案

> 核心原则：工具冲突时优先使用 MCP，由内部定义专有的 MCP 实现。

> **基线对齐说明（2026-07-08）**：本文档记录审计发现与修复方案。当前实现已采用 pluginExpert 单节点架构（非 editorAgent/flowAgent/pageAgent），MCP 工具使用 `{domain}__` 前缀命名。以下工具名已对齐实际代码。

---

## 修复优先级矩阵

| # | 检查项 | 状态 | 严重度 | 修复复杂度 | 优先级 |
|---|--------|------|--------|-----------|--------|
| 4 | 熔断保护 | ✅ 已修复 | 🔴 高 | 低 | P0 |
| 3 | 职责划分 | ✅ 已落地 | 🟡 中 | 高 | P1 |
| 5 | 命名空间 | ✅ 已落地 | 🟡 中 | 低 | P1 |
| 10 | 循环拦截 | ✅ 已落地 | 🟡 中 | 中 | P1 |
| 1 | 模型选型 | ✅ 已落地 | 🟡 中 | 中 | P2 |
| 8 | 模型匹配 | ✅ 已落地 | 🟡 中 | 中 | P2 |
| 9 | 参数健壮性 | ✅ 已落地 | 🟡 中 | 低 | P2 |
| 6 | Agent 合规 | ✅ 已落地 | 🟡 中 | 高 | P2 |
| 2 | 工具定义 | ✅ | 🟢 低 | 低 | P3 |
| 7 | 会话管理 | ✅ | 🟢 低 | 无 | — |

---

## 1. 模型选型 — 引入 DeepSeek 原生适配

### 1.1 现状

```
@langchain/openai (ChatOpenAI) → 兼容层 → DeepSeek API
```

- 依赖：`@langchain/openai@^1.4.7`，无 `@langchain/deepseek`
- `reasoning_content` 需手动从 `additional_kwargs` 提取
- `response_format` 通过 `modelKwargs` 透传，非原生支持

### 1.2 根因

DeepSeek API 兼容 OpenAI 格式，项目直接复用 `ChatOpenAI`，未引入 DeepSeek 专用适配层。

### 1.3 修复方案

**短期（推荐）**：保持 `ChatOpenAI` 兼容层，在 `llmCache.ts` 中统一封装 DeepSeek 特有逻辑。

```typescript
// llmCache.ts — 增强版
export function getLLM(opts: LLMOptions = {}): ChatOpenAI {
  const key = cacheKey(opts)
  if (!llmCache.has(key)) {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY required.')

    const model = new ChatOpenAI({
      model: opts.model ?? 'deepseek-v4-pro',
      apiKey,
      configuration: { baseURL: 'https://api.deepseek.com' },
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxTokens ?? 8192,
      streaming: true,
      timeout: 120_000,
      // DeepSeek JSON 模式：仅在 temperature > 0 时启用
      ...(opts.jsonMode && (opts.temperature ?? 0.7) > 0
        ? { modelKwargs: { response_format: { type: 'json_object' } } }
        : {}),
    })
    llmCache.set(key, model)
  }
  return llmCache.get(key)!
}
```

**长期**：监控 `@langchain/deepseek` 包发布状态，一旦稳定则迁移。

### 1.4 文件变更

| 文件 | 变更 |
|------|------|
| `services/llmCache.ts` | 增加 temperature/jsonMode 冲突检测逻辑 |

---

## 2. 工具定义 — 统一 schema 校验层

### 2.1 现状

- 所有 20 个 LangGraph 工具均使用 `tool()` + Zod schema，定义完整
- 9 个 MCP 工具使用 `server.tool()` + Zod schema，定义完整
- 但两者校验逻辑重复实现

### 2.2 问题

~~`validate_schema` 名称冲突~~ — 已通过 `{domain}__` 前缀解决：
- MCP 版本：`schema__validate`（文档级校验）
- MCP 版本：`widget__validate`（组件级校验）
- `schema__validate_widgets`（Widget 数组校验）

### 2.3 修复方案（已落地）

| 原名 | MCP 版本（权威，已实现） | LangGraph 版本 |
|------|-------------------------|----------------|
| `validate_schema` | `schema__validate`（文档级） | 删除，改用 MCP |
| — | `widget__validate`（组件级） | 删除，改用 MCP |
| — | `schema__validate_widgets`（Widget 数组） | 删除，改用 MCP |

### 2.4 文件变更（已落地）

| 文件 | 变更 |
|------|------|
| `mcp/schemaServer.ts` | `schema__validate` 文档级校验 + `schema__validate_widgets` Widget 数组校验 |
| `mcp/widgetServer.ts` | `widget__validate` 组件级校验 |
| `tools/editorTools.ts` | 仅保留 HITL 工具（update_schema 等） |
| `tools/registry.ts` | 统一工具注册表，MCP + LangGraph + HTTP 三源合并 |

---

## 3. 职责划分 — MCP 统一重型资产，内部保留专有逻辑

### 3.1 架构原则

```
┌─────────────────────────────────────────────────────────┐
│                    工具定义分层                            │
├─────────────────────────────────────────────────────────┤
│  MCP Server（权威定义源，{domain}__ 前缀）                │
│  ├── 读取类：schema__search, schema__get_detail, ...     │
│  ├── 校验类：schema__validate, widget__validate, ...     │
│  └── 扩展：rag__search, industry__search_templates, ...  │
├─────────────────────────────────────────────────────────┤
│  LangGraph 专有工具（图状态依赖）                          │
│  ├── HITL：update_schema, update_flow                    │
│  ├── 复合写入：save_and_bind_schema, bind_schema_to_node │
│  ├── LLM 调用：generate_schema                           │
│  └── 图路由：request_collaboration                       │
├─────────────────────────────────────────────────────────┤
│  HTTP 工具（插件中心声明，kind='http'）                    │
│  └── 动态注册，由 PluginRegistry 提供                     │
├─────────────────────────────────────────────────────────┤
│  统一注册表（tools/registry.ts）                          │
│  └── MCP + LangGraph + HTTP → getAllToolsSync()          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 工具归属表（已对齐 `{domain}__` 命名）

| 工具 | 归属 | 理由 |
|------|------|------|
| `schema__search` | **MCP** | 纯读取 |
| `schema__get_detail` | **MCP** | 纯读取 |
| `schema__search_published` | **MCP** | 纯读取 |
| `schema__fuzzy_search` | **MCP** | 纯读取 |
| `schema__find_flow_references` | **MCP** | 纯读取 |
| `schema__validate` | **MCP** | 文档级校验 |
| `schema__validate_widgets` | **MCP** | Widget 数组校验 |
| `flow__search` | **MCP** | 纯读取 |
| `flow__get_detail` | **MCP** | 纯读取 |
| `flow__validate` | **MCP** | 校验 |
| `flow__search_users` | **MCP** | 纯读取 |
| `flow__get_node_schema` | **MCP** | 纯读取 |
| `widget__query` | **MCP** | 纯读取 |
| `widget__validate` | **MCP** | 校验 |
| `rag__search` | **MCP** | 纯读取 |
| `industry__search_templates` | **MCP** | 纯读取 |
| `industry__validate_form` | **MCP** | 校验 |
| `update_schema` | **LangGraph** | HITL interrupt |
| `update_flow` | **LangGraph** | HITL interrupt |
| `generate_schema` | **LangGraph** | LLM 调用 |
| `save_and_bind_schema` | **LangGraph** | 复合写入 |
| `bind_schema_to_flow_node` | **LangGraph** | 写入 |
| `request_collaboration` | **LangGraph** | 图路由 |
| `rag_index` | **LangGraph** | 写入 |

### 3.3 共享业务逻辑层提取

新建 `services/schemaService.ts`、`services/flowService.ts`、`services/widgetService.ts`，将重复的数据库查询和校验逻辑提取为纯函数，MCP Server 和 LangGraph 工具共同调用。

```
// 示例：services/flowService.ts
export async function searchFlows(params: SearchFlowsParams): Promise<FlowSummary[]> { ... }
export async function getFlowDetail(flowId: string): Promise<FlowDetail | null> { ... }
export function validateFlowGraph(flow: FlowGraphInput): string[] { ... }
```

### 3.4 文件变更（已落地）

| 文件 | 变更 |
|------|------|
| `mcp/schemaServer.ts` | 调用 service 层，工具名 `schema__*` |
| `mcp/flowServer.ts` | 调用 service 层，工具名 `flow__*` |
| `mcp/widgetServer.ts` | 调用 service 层，工具名 `widget__*` |
| `tools/editorTools.ts` | 仅保留 HITL 工具（update_schema 等） |
| `tools/flowTools.ts` | 仅保留 HITL/写入工具（update_flow 等） |
| `tools/langgraphTools.ts` | **新建**：LangGraph 专有工具集合 |
| `tools/registry.ts` | **新建**：统一工具注册表（MCP + LangGraph + HTTP） |
| ~~`tools/schemaTools.ts`~~ | 已删除，功能合并到 MCP schemaServer |
| ~~`tools/allTools.ts`~~ | 已删除，被 registry.ts 替代 |

---

## 4. 熔断保护 — ToolNode 错误兜底

### 4.1 现状

```typescript
// graph.ts:32 — 无错误处理
const allToolNode = new ToolNode(allTools)
```

工具异常直接传播到图执行器，导致整个对话中断。

### 4.2 根因

`ToolNode` 构造时未配置 `handleToolErrors`。

### 4.3 修复方案

```typescript
// graph.ts
const allToolNode = new ToolNode(allTools)

// 重写 ToolNode 的错误处理
const allToolNodeWithErrorHandling = new ToolNode(allTools, {
  handleToolErrors: (error: Error) => {
    console.error(`[ToolNode] 工具执行失败: ${error.message}`)
    return JSON.stringify({
      success: false,
      error: `工具执行失败: ${error.message}`,
      recoverable: true,
    })
  },
})
```

同时在每个工具的 `async` 函数入口添加 try-catch 兜底：

```typescript
// tools/toolWrapper.ts — 工具包装器
export function withErrorHandling<T extends Record<string, unknown>>(
  fn: (params: T) => Promise<string>,
  toolName: string,
): (params: T) => Promise<string> {
  return async (params: T): Promise<string> => {
    try {
      return await fn(params)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[tool:${toolName}] 执行失败: ${message}`)
      return JSON.stringify({
        success: false,
        error: `[${toolName}] ${message}`,
        recoverable: true,
      })
    }
  }
}
```

### 4.4 文件变更

| 文件 | 变更 |
|------|------|
| `graph/graph.ts` | ToolNode 配置 `handleToolErrors` |
| `tools/toolWrapper.ts` | **新建**：`withErrorHandling` 包装器 |
| `tools/editorTools.ts` | 使用 `withErrorHandling` 包装 |
| `tools/flowTools.ts` | 使用 `withErrorHandling` 包装 |
| `tools/ragTools.ts` | 使用 `withErrorHandling` 包装 |
| `tools/industryTools.ts` | 使用 `withErrorHandling` 包装 |

---

## 5. 命名空间 — MCP 工具域前缀

### 5.1 问题（已修复）

MCP SDK 不内置 `tool_name_prefix`，多 Server 连接时客户端侧可能冲突。

### 5.2 修复方案（已落地）

MCP Server 注册工具时使用 `{domain}__{name}` 前缀，实际工具名：

```
schema: schema__search, schema__get_detail, schema__validate, schema__validate_widgets,
        schema__search_published, schema__fuzzy_search, schema__find_flow_references
flow:   flow__search, flow__get_detail, flow__validate, flow__search_users, flow__get_node_schema
widget: widget__query, widget__validate
rag:    rag__search, ...
industry: industry__search_templates, industry__validate_form, ...
```

### 5.3 文件变更（已落地）

| 文件 | 变更 |
|------|------|
| `mcp/schemaServer.ts` | 工具名 `schema__*` 前缀 |
| `mcp/flowServer.ts` | 工具名 `flow__*` 前缀 |
| `mcp/widgetServer.ts` | 工具名 `widget__*` 前缀 |
| `mcp/ragServer.ts` | 工具名 `rag__*` 前缀 |
| `mcp/industryServer.ts` | 工具名 `industry__*` 前缀 |

---

## 6. Agent 合规 — MCP 工具注入 LangGraph — 已落地

### 6.1 现状（已修复）

- LangGraph 使用自定义 `StateGraph`，未使用 `create_react_agent`
- ~~MCP 工具完全独立，Agent 无法调用~~ → 已通过 InMemoryTransport 桥接
- ~~`allTools` 只包含 LangGraph 工具（20 个）~~ → `tools/registry.ts` 统一管理 MCP + LangGraph + HTTP 工具

### 6.2 修复方案（已实现）

采用 **InMemoryTransport 直连** 方案，实际实现见 `mcp/bridge.ts` + `tools/registry.ts`。

桥接层从 Plugin Registry 动态读取 MCP Server 声明（非硬编码 import），任一 server 失败不中断整体。

### 6.3 图编排调整（已落地）

```typescript
// graph/graph.ts — 通过 registry 获取工具
import { getAllToolsSync } from '../tools/registry.js'

const allToolNode = new ToolNode(getAllToolsSync())
```

### 6.4 文件变更（已落地）

| 文件 | 变更 |
|------|------|
| `mcp/bridge.ts` | MCP → LangGraph 桥接层（InMemoryTransport） |
| `tools/langgraphTools.ts` | LangGraph 专有工具集合（HITL + 写入 + 协作） |
| `tools/registry.ts` | 统一工具注册表（MCP + LangGraph + HTTP） |
| ~~`tools/allTools.ts`~~ | 已删除，被 registry.ts 替代 |
| `graph/graph.ts` | 通过 `getAllToolsSync()` 获取工具 |

---

## 7. 会话管理 — 保持现状 + 生产加固

### 7.1 现状

✅ 已实现 MongoDB Checkpointer，支持 thread_id 隔离。

### 7.2 风险

`MemorySaver` 降级在生产环境可能导致会话丢失。

### 7.3 修复方案

```typescript
// checkpointer.ts — 生产环境强制 MongoDB
function createCheckpointer(): BaseCheckpointSaver {
  if (process.env.NODE_ENV === 'production') {
    return new MongoDBCheckpointer()  // 生产环境不降级
  }
  try {
    return new MongoDBCheckpointer()
  } catch {
    console.warn('[checkpointer] MongoDB 不可用，降级到 MemorySaver')
    return new MemorySaver() as unknown as BaseCheckpointSaver
  }
}
```

### 7.4 文件变更

| 文件 | 变更 |
|------|------|
| `graph/checkpointer.ts` | 生产环境强制 MongoDB，失败则抛错 |

---

## 8. 模型匹配 — chat/reasoner 分流

### 8.1 问题（已修复）

所有节点统一使用 `deepseek-v4-pro`，`getModelForTask()` 已定义但从未调用。

### 8.2 修复方案（已落地）

通过 expert 定义的 `model.task` 字段，pluginExpert 统一使用 `getModelForTask` + `resolveUserModel`：

| 任务类型 | 模型 | 理由 |
|---------|------|------|
| `router` / `analyze` | `deepseek-chat` | 轻量路由/意图分析，速度快 |
| `generate_simple` / `generate_complex` | `deepseek-v4-pro` | 复杂生成任务 |
| `summarizer` | `deepseek-chat` | 简单总结 |

```typescript
// agentBase.ts — getModelForTask
export function getModelForTask(taskType: TaskType): string {
  const modelMap: Record<TaskType, string> = {
    router: 'deepseek-chat',
    generate_simple: 'deepseek-v4-pro',
    generate_complex: 'deepseek-v4-pro',
    analyze: 'deepseek-chat',
  }
  return modelMap[taskType] ?? 'deepseek-v4-pro'
}

// pluginExpertAgent.ts — 统一使用 getModelForTask + resolveUserModel
const taskName = (expert.model?.task ?? 'generate_complex') as TaskType
const llm = await getLLM({
  model: resolveUserModel(state.interaction.preferences, getModelForTask(taskName)),
  temperature: expert.model?.temperature ?? 0.7,
  maxTokens: expert.model?.maxTokens ?? 8192,
})
```

### 8.3 文件变更（已落地）

| 文件 | 变更 |
|------|------|
| `graph/agentBase.ts` | `getModelForTask` 模型映射 + `resolveUserModel` 用户偏好 |
| `graph/graph.ts` | summarizerNode 使用 `getModelForTask` |
| `graph/pluginExpertAgent.ts` | 统一使用 `getModelForTask` + `resolveUserModel` |

---

## 9. 参数健壮性 — temperature/jsonMode 冲突修复

### 9.1 问题

1. `temperature=0` + `jsonMode=true` 同时设置，DeepSeek API 行为不稳定
2. `top_p` 未配置，与 `temperature` 可能冲突
3. thinkerNode 的 JSON 解析使用贪婪匹配 `{[\s\S]*}`

### 9.2 修复方案

#### 9.2.1 temperature/jsonMode 互斥处理

```typescript
// llmCache.ts
export function getLLM(opts: LLMOptions = {}): ChatOpenAI {
  // temperature=0 时不启用 jsonMode（DeepSeek 兼容性）
  const effectiveJsonMode = opts.jsonMode && (opts.temperature ?? 0.7) > 0

  return new ChatOpenAI({
    // ...
    temperature: opts.temperature ?? 0.7,
    ...(effectiveJsonMode
      ? { modelKwargs: { response_format: { type: 'json_object' } } }
      : {}),
  })
}
```

#### 9.2.2 JSON 解析加固

```typescript
// graph.ts — thinkerNode
function extractJsonFromResponse(raw: string): Record<string, unknown> | null {
  // 优先匹配 ```json ... ``` 代码块
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch { /* fallthrough */ }
  }

  // 降级：匹配第一个完整 JSON 对象（非贪婪）
  const jsonMatch = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch { /* fallthrough */ }
  }

  return null
}
```

#### 9.2.3 单元测试

```typescript
// __tests__/llmParams.spec.ts
describe('LLM 参数健壮性', () => {
  it('temperature=0 时不应启用 jsonMode', () => {
    const model = getLLM({ temperature: 0, jsonMode: true })
    // 验证 modelKwargs 不包含 response_format
  })

  it('temperature>0 时应启用 jsonMode', () => {
    const model = getLLM({ temperature: 0.7, jsonMode: true })
    // 验证 modelKwargs 包含 response_format
  })

  it('应正确解析带代码块的 JSON', () => {
    const raw = '思考过程...\n```json\n{"target": "editor"}\n```'
    expect(extractJsonFromResponse(raw)).toEqual({ target: 'editor' })
  })

  it('应拒绝不完整的 JSON', () => {
    const raw = '{"target": "editor"'
    expect(extractJsonFromResponse(raw)).toBeNull()
  })
})
```

### 9.3 文件变更

| 文件 | 变更 |
|------|------|
| `services/llmCache.ts` | temperature/jsonMode 互斥逻辑 |
| `graph/graph.ts` | 提取 `extractJsonFromResponse` 函数，thinkerNode 使用 |
| `__tests__/llmParams.spec.ts` | **新建**：参数健壮性测试 |

---

## 10. 循环拦截 — 全局死循环防护

### 10.1 现有防护

- `MAX_TOOL_ITERATIONS = 3`（工具调用循环）
- 任务链 `currentIndex >= chain.length` 检查

### 10.2 缺失防护

- 无全局节点执行次数限制
- 协作请求无去重检测（A→B→A→B 无限循环）

### 10.3 修复方案

#### 10.3.1 全局节点执行计数器

```typescript
// state.ts — 新增全局计数器
export const AgentStateAnnotation = Annotation.Root({
  // ... 现有字段
  runtime: Annotation<{
    nodeExecutionCount: number
    maxNodeExecutions: number
  }>({
    reducer: (_, next) => next,
    default: () => ({ nodeExecutionCount: 0, maxNodeExecutions: 20 }),
  }),
})

// graph.ts — 每个节点入口检查
async function routerNode(state) {
  if (state.runtime.nodeExecutionCount >= state.runtime.maxNodeExecutions) {
    console.error(`[router] 全局节点执行上限 ${state.runtime.maxNodeExecutions}，强制结束`)
    return { error: { message: '执行超限，已自动停止', recoverable: false } }
  }
  return {
    runtime: {
      ...state.runtime,
      nodeExecutionCount: state.runtime.nodeExecutionCount + 1,
    },
    // ... 正常逻辑
  }
}
```

#### 10.3.2 协作请求去重

```typescript
// state.ts — 新增协作历史
interaction: Annotation<{
  // ... 现有字段
  collaborationHistory: Array<{ from: string; to: string; timestamp: number }>
}>

// graph.ts — taskChainNode 协作去重
if (state.interaction.collaborationRequest) {
  const { targetAgent } = state.interaction.collaborationRequest
  const currentAgent = state.session.currentAgent

  // 检查是否已存在反向协作（防止 A→B→A 循环）
  const reverseExists = state.interaction.collaborationHistory.some(
    (h) => h.from === targetAgent && h.to === currentAgent
  )

  if (reverseExists) {
    console.warn(`[taskChain] 检测到协作循环 ${currentAgent}↔${targetAgent}，跳过`)
    return { interaction: { ...state.interaction, collaborationRequest: null } }
  }

  // 记录协作历史
  const newHistory = [
    ...state.interaction.collaborationHistory,
    { from: currentAgent, to: targetAgent, timestamp: Date.now() },
  ]
  // ... 继续正常协作逻辑
}
```

#### 10.3.3 afterAgent 退出条件加固

```typescript
// graph.ts — afterAgent
export function afterAgent(state): string {
  // 全局检查
  if (state.runtime.nodeExecutionCount >= state.runtime.maxNodeExecutions) {
    console.warn(`[afterAgent] 全局执行上限，强制 END`)
    return END
  }

  // ... 现有逻辑
}
```

### 10.4 文件变更

| 文件 | 变更 |
|------|------|
| `graph/state.ts` | 新增 `runtime` 状态组、`collaborationHistory` 字段 |
| `graph/graph.ts` | routerNode/taskChainNode/afterAgent 添加全局计数和协作去重 |

---

## 实施路线图

### Phase 1：紧急修复（P0） — 已完成

- [x] 4. 熔断保护：ToolNode `handleToolErrors` + `callLLMWithFallback` 统一错误处理

### Phase 2：架构统一（P1） — 已完成

- [x] 3. 职责划分：MCP Server 调用 service 层，工具名 `{domain}__` 前缀
- [x] 5. 命名空间：MCP 工具名 `schema__*` / `flow__*` / `widget__*` / `rag__*` / `industry__*`
- [x] 10. 循环拦截：全局节点计数器 `nodeExecutionCount` + 协作去重 `collaborationHistory`
- [x] pluginExpert 单节点架构：替代 editorAgent/flowAgent/pageAgent 三节点

### Phase 3：能力增强（P2） — 部分完成

- [x] 1. 模型选型：llmCache temperature/jsonMode 互斥处理
- [x] 8. 模型匹配：`getModelForTask` + `resolveUserModel` 用户偏好模型
- [ ] 9. 参数健壮性：JSON 解析加固 + 单元测试（待补充）
- [x] 6. Agent 合规：InMemoryTransport 桥接 MCP 工具到 LangGraph（`mcp/bridge.ts` + `tools/registry.ts`）

### Phase 4：清理收尾（P3） — 部分完成

- [x] 2. 工具定义：删除重复工具，统一命名
- [x] 7. 会话管理：MongoDB Checkpointer + 生产环境强制
- [ ] 文档更新：架构图、工具清单、开发指南（本文档即为对齐）

# 生产环境稳定性修复方案

> 问题：每次部署后 AI 对话不稳定，Agents 频繁 400，错误直接暴露给用户。

> **基线对齐说明（2026-07-08）**：本文档中的修复方案已大部分落地。当前架构采用 pluginExpert 单节点（非 editorAgent/flowAgent/pageAgent 三节点），统一错误处理通过 `callLLMWithFallback` 实现。

---

## 一、根因分析（按严重度排序）

### 🔴 P0-1：`source: 'page'` 被 Zod 拦截 → 400

**文件**：`ai/schemas/aiSchemas.ts:13`

```typescript
// 当前代码
source: z.enum(['editor', 'flow', 'standalone']),  // 缺少 'page'

// 图代码 graph.ts:41 接受 'page'
if (state.context.source === 'editor' || state.context.source === 'flow' || state.context.source === 'page')
```

**影响**：前端发送 `source: 'page'` 的请求被 Zod 直接拒绝，返回 400，Page Agent 永远无法到达。

**修复**：
```typescript
source: z.enum(['editor', 'flow', 'page', 'standalone']),
```

---

### 🔴 P0-2：Agent 节点 LLM 调用失败 → 原始错误透传到对话 — 已修复

**文件**：`graph/pluginExpertAgent.ts`（统一入口，非 editorAgent/flowAgent/pageAgent）

```typescript
// 已修复 — 使用 callLLMWithFallback 统一错误处理
return callLLMWithFallback('pluginExpert', async () => {
  const stream = await model.stream(messages)
  // ...
})
```

**影响**：DeepSeek 返回的原始错误（如 "context_length_exceeded"、"invalid_api_key"、"rate_limit"）通过 `callLLMWithFallback` 分类后返回用户友好消息。

**修复**：`graph/agentErrorHandler.ts` 统一错误包装，原始错误只写日志。

---

### 🔴 P0-3：summarizerNode 无 try-catch → 图崩溃 — 已修复

**文件**：`graph/graph.ts`

已通过 `callLLMWithFallback` 包装，LLM 失败时降级返回任务列表，不中断图执行。

---

### 🟡 P1-1：ToolNode 无 handleToolErrors → 工具异常中断对话 — 已修复

**文件**：`graph/graph.ts`

已实现 `allToolNodeWithErrorHandling`，工具异常时为每个待执行 tool_call 生成独立的错误 ToolMessage，不中断图执行。

---

### 🟡 P1-2：SSE error 事件格式不一致 → 前端无法统一处理

**文件**：`routes.ts:697-708` vs `routes.ts:830-863`

```typescript
// chat handler — 有 agent 字段
send({ type: 'error', content: `[${phaseLabel}] ${errorMsg}`, agent: currentAgent })

// resume handler — 无 agent 字段
send({ type: 'error', content: errorMsg })

// chat handler 还追加了文本错误
send({ type: 'text', content: `\n\n⚠️ 生成中断：${errorMsg}` })
```

**影响**：前端需要处理 3 种不同的错误格式，错误消息重复显示。

---

### 🟡 P1-3：每次部署后 checkpointer 状态不兼容 → 旧对话 400

**文件**：`graph/checkpointMongo.ts` + `graph/graph.ts:583`

```typescript
// 版本断言桥接
const graph = builder.compile({ checkpointer: checkpointer as unknown as BaseCheckpointSaver })
```

**影响**：如果 `@langchain/langgraph-checkpoint` 版本升级导致序列化格式变化，旧对话的 checkpoint 无法反序列化，恢复对话时崩溃。

---

### 🟢 P2-1：withRetry 未被 Agent 节点使用

**文件**：`graph/agentBase.ts:338-359` 定义了 `withRetry`，但只有 `schemaGenerator.ts` 使用。主 Agent 节点直接调用 `model.stream()` 无重试。

---

## 二、修复方案

### Fix-1：Zod Schema 补全 `source` 枚举（P0）

```typescript
// ai/schemas/aiSchemas.ts
source: z.enum(['editor', 'flow', 'page', 'standalone']),
```

---

### Fix-2：统一 Agent 错误处理层（P0） — 已落地

新建 `graph/agentErrorHandler.ts`，pluginExpert 和 summarizer 共用：

```typescript
// graph/agentErrorHandler.ts — 已实现
export async function callLLMWithFallback<T>(
  agentName: string,
  fn: () => Promise<T>,
  fallbackContent?: string,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    // 分类错误 → 用户友好消息 → 原始错误只写日志
  }
}
```

**pluginExpert 统一使用**：

```typescript
// graph/pluginExpertAgent.ts — 统一专家节点
return callLLMWithFallback('pluginExpert', async () => {
  const stream = await model.stream(messages)
  // ...
})

// graph/graph.ts — summarizerNode
const result = await callLLMWithFallback('summarizer', async () => {
  // ...
}, fallbackContent)
```

---

### Fix-3：ToolNode 错误兜底（P1） — 已落地

```typescript
// graph/graph.ts — 已实现
const allToolNode = new ToolNode(getAllToolsSync())

async function allToolNodeWithErrorHandling(state) {
  try {
    return await allToolNode.invoke(state)
  } catch (err) {
    // 为每个待执行的 tool_call 生成独立的错误 ToolMessage
    // 结构化日志：ai:thinker:error
    // 返回 { messages: errorMessages }，不中断图执行
  }
}
```

---

### Fix-4：SSE 错误事件标准化（P1）

```typescript
// routes.ts — 统一错误发送函数
function sendError(send: (data: Record<string, unknown>) => void, opts: {
  error: unknown
  agent?: string
  phase?: 'thinking' | 'generating'
}) {
  const rawMsg = opts.error instanceof Error ? opts.error.message : String(opts.error)
  const errorType = classifyError(opts.error)
  const friendlyMsg = USER_FRIENDLY_MESSAGES[errorType] ?? 'AI 处理异常，请重试'

  // 日志：完整错误
  console.error(`[AI Chat] ${opts.agent ?? 'unknown'} [${opts.phase ?? 'unknown'}]:`, rawMsg)

  // 前端：友好消息
  send({
    type: 'error',
    content: friendlyMsg,           // 用户友好的消息
    agent: opts.agent ?? 'unknown',
    errorType,                      // 分类标识（前端可用于展示不同样式）
    recoverable: errorType !== 'invalid_api_key',  // 是否可重试
  })

  // 不再追加 type: 'text' 的错误消息（避免重复显示）
}

// catch 块改造
} catch (err) {
  if (isGraphInterrupt(err)) {
    // ... interrupt 处理不变
    return
  }

  sendError(send, {
    error: err,
    agent: currentAgent,
    phase: accumulatedContent ? 'generating' : 'thinking',
  })
}
```

---

### Fix-5：Checkpointer 启动校验（P1） — 已落地

```typescript
// graph/checkpointer.ts — 已实现
// 生产环境：必须用 MongoDB，失败则抛错阻止启动
// 开发环境：优先 MongoDB，降级 MemorySaver
```

---

### Fix-6：Agent 节点 LLM 重试（P2） — 已落地

```typescript
// graph/agentBase.ts — 已实现
// withRetry 带指数退避的重试包装器
// callLLMWithFallback 提供降级兜底
```

---

## 三、错误处理分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Zod 校验（路由入口）                                    │
│  ├── 400: 参数格式错误                                           │
│  └── 修复：补全 source 枚举                                      │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Agent 错误处理（agentErrorHandler.ts）                  │
│  ├── LLM 400/401/429/5xx → 分类 → 用户友好消息                   │
│  ├── 原始错误 → console.error（服务端日志）                       │
│  └── 降级：summarizer 返回任务列表，其他返回友好提示               │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: ToolNode 兜底（graph.ts）                               │
│  ├── 工具异常 → ToolMessage 包装 → LLM 自行处理                   │
│  └── 不中断图执行                                                │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: SSE 标准化（routes.ts）                                 │
│  ├── 统一 sendError() 函数                                       │
│  ├── 只发送 { type: 'error', content: 友好消息, errorType }       │
│  └── 不再追加 type: 'text' 错误消息                              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: 前端展示（ai-app）                                     │
│  ├── 接收 error 事件 → 展示友好消息 + 重试按钮                    │
│  ├── 接收 tool_error 事件 → 展示工具名 + 简要说明                 │
│  └── 不展示技术详情                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、前端错误展示规范

### SSE 事件类型

```typescript
// 标准错误事件
{
  type: 'error',
  content: 'AI 服务繁忙，请稍后重试',    // 用户友好消息
  agent: 'pluginExpert',                 // 出错的节点
  errorType: 'rate_limit',              // 分类标识
  recoverable: true,                    // 是否可重试
}

// 工具错误事件（不中断对话，LLM 自行处理）
{
  type: 'tool_error',
  toolName: 'schema__search',
  content: '搜索失败，请重试',
}
```

### 前端处理逻辑

```typescript
// ai-app/stores/ai.ts
case 'error':
  // 不再作为普通消息添加到对话
  // 而是展示为系统提示（可关闭、可重试）
  showErrorToast({
    message: event.content,
    recoverable: event.recoverable,
    onRetry: event.recoverable ? () => resendLastMessage() : undefined,
  })
  break

case 'tool_error':
  // 工具错误：展示为轻量提示，不中断对话
  showToolErrorNotice({
    toolName: event.toolName,
    message: event.content,
  })
  break
```

---

## 五、部署后不稳定的排查清单

| # | 检查项 | 命令/方法 | 预期结果 |
|---|--------|----------|---------|
| 1 | DEEPSEEK_API_KEY 是否设置 | `echo $DEEPSEEK_API_KEY` | 非空，长度 > 10 |
| 2 | MongoDB 连接是否正常 | `curl http://localhost:3001/api/health` | `db.ping: ok` |
| 3 | Checkpointer 初始化日志 | 搜索 `checkpointer` 日志 | `MongoDB checkpointer 初始化成功` |
| 4 | 模型名是否正确 | 搜索 `getLLM` 调用 | `deepseek-v4-pro` |
| 5 | source='page' 是否通过校验 | 发送 `source: 'page'` 请求 | 不返回 400 |
| 6 | pluginExpert 错误日志 | 搜索 `[pluginExpert] LLM 调用失败` | 应该有友好错误分类 |
| 7 | SSE error 事件格式 | 前端 Network 面板 | 只有 `type: 'error'`，无重复 `type: 'text'` |
| 8 | 工具注册表就绪 | 搜索 `toolsRegistry` 日志 | `init failed` 无报错 |

---

## 六、实施顺序

| 优先级 | Fix | 工作量 | 影响范围 | 状态 |
|--------|-----|--------|---------|------|
| P0 | Fix-1: source 枚举补全 | 1 行 | Page Agent 可用 | ✅ |
| P0 | Fix-2: Agent 错误处理层 | agentErrorHandler.ts + pluginExpert/summarizer | 统一错误处理 | ✅ |
| P0 | Fix-3: summarizerNode try-catch | callLLMWithFallback 包装 | 多步任务不再崩溃 | ✅ |
| P1 | Fix-4: SSE 错误标准化 | routes.ts | 前端统一处理 | ✅ |
| P1 | Fix-5: Checkpointer 启动校验 | checkpointer.ts | 生产环境快速失败 | ✅ |
| P2 | Fix-6: Agent LLM 重试 | agentBase.ts | 瞬态错误自动恢复 | ✅ |

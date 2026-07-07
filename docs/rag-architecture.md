# RAG 知识库 — 架构与 Embedding 选型

> 最后更新: 2026-07-06
> 生产状态: ✅ 已部署，150 Schema + Flow 全量索引完成

## 一、架构概览

RAG（Retrieval-Augmented Generation）知识库为 AI Agent 提供语义检索能力，让 LLM 在生成回答时能参考已有的 Schema 和流程定义。

### 1.1 数据流

```
索引管道（写入）:
  Schema/Flow 创建/更新
    → Mongoose hook (scheduleSchemaRagIndex)
    → indexSchema / indexFlowDefinition
    → contentHash 比对（跳过未变更）
    → embedText (Embedding API)
    → SchemaEmbeddingModel.upsert

检索管道（读取）:
  用户查询 / Agent 工具调用
    → semanticSearch
    → embedText (Embedding API) → 向量余弦相似度 top-k
    → 降级: fuzzySearchSchemas (Jaccard 关键词匹配)
    → 返回 SearchResult[]
```

### 1.2 核心组件

| 组件 | 文件 | 职责 |
|---|---|---|
| Embedding 服务 | `services/embeddingService.ts` | OpenAI 兼容 Embedding API 客户端，LRU 缓存（500 条） |
| RAG 服务 | `services/ragService.ts` | 索引管理 + 语义搜索 + 关键词降级 |
| 向量存储 | `models/SchemaEmbedding.ts` | MongoDB 存储向量 + 元数据 |
| 管理路由 | `ragRoutes.ts` | REST API：reindex / status / delete |
| MCP 工具 | `mcp/ragServer.ts` | `rag__search` 语义搜索工具 |
| LangGraph 工具 | `tools/ragTools.ts` | `rag_index` 索引写入工具 |
| 上下文注入 | `graph/ragContextRetriever.ts` | Agent 调用前自动检索 top-3 参考 Schema |
| 自动索引 | `services/ragIndexScheduler.ts` | Mongoose hook 触发的 fire-and-forget 索引 |

---

## 二、Embedding 模型选型

### 2.1 候选模型对比

| 维度 | BGE-M3 | text-embedding-3-small | text-embedding-3-large |
|---|---|---|---|
| **提供商** | BAAI（智源） | OpenAI | OpenAI |
| **维度** | 1024 | 1536 | 3072 |
| **最大 token** | 8192 | 8191 | 8191 |
| **中文效果** | C-MTEB SOTA | 良好 | 良好 |
| **多语言** | 100+ 语言 | 有限 | 有限 |
| **稀疏检索** | 原生支持 | 不支持 | 不支持 |
| **ColBERT 重排** | 原生支持 | 不支持 | 不支持 |
| **Matryoshka** | 支持（256/512） | 不支持 | 支持（256） |
| **许可** | MIT（免费商用） | 付费 | 付费 |
| **价格** | 免费（自部署/托管） | $0.02/1M tokens | $0.13/1M tokens |

### 2.2 选型结论

**推荐 BGE-M3**，理由：
1. 中文效果最佳（C-MTEB 榜单长期领先）
2. 免费（MIT 许可），无 per-token 成本
3. 原生支持 dense + sparse + ColBERT 三种检索模式，后续可扩展混合检索
4. 支持 8192 token 长文本，适合长表单描述

### 2.3 BGE-M3 技术规格

| 参数 | 值 |
|---|---|
| 模型名 | BAAI/bge-m3 |
| 架构 | XLM-RoBERTa |
| 参数量 | ~568M |
| 模型大小 | ~1.1GB（FP16） |
| 输出维度 | 1024（dense） |
| 最大输入 | 8192 token |
| 许可 | MIT |
| 三种检索 | dense（向量）、sparse（关键词权重）、ColBERT（token 级重排） |

---

## 三、部署方案对比

| 方案 | 需要 GPU | 接入难度 | 延迟 | 适用场景 |
|---|---|---|---|---|
| **SiliconFlow 托管** | ❌ | ⭐ 最低 | ~50-100ms | 生产环境（推荐） |
| Ollama 本地 | ❌（CPU 可用） | ⭐⭐ | 1-3s | 开发测试 |
| TEI Docker | ✅ | ⭐⭐⭐ | ~20ms | 有 GPU 的生产环境 |
| FlagEmbedding | ✅ | ⭐⭐⭐⭐ | ~20ms | 需要 sparse/ColBERT |

### 推荐：SiliconFlow 托管 BGE-M3

SiliconFlow（硅基流动）是国内 AI 推理云平台，提供 BGE-M3 的托管 API，API 格式与 OpenAI 完全兼容。

**优势**：
- 无需部署本地模型，无需 GPU
- 有免费额度，超出后价格极低
- 国内节点，延迟低（~50-100ms）
- OpenAI 兼容 API，现有代码零改动

---

## 四、SiliconFlow 接入指南

### 4.1 注册与获取 Key

1. 访问 [siliconflow.cn](https://siliconflow.cn) 注册账号
2. 进入控制台 → API Key 管理 → 创建 Key
3. 免费额度足够中小规模使用

### 4.2 配置

在 `.env` 中设置：

```env
EMBEDDING_API_KEY=sk-xxx           # SiliconFlow API Key
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
```

### 4.3 切换后操作

1. 重启 server
2. 调用 `POST /api/ai/rag/reindex` 全量重建向量索引（维度从 1536→1024，已有向量不兼容）
3. 在 AI 知识库管理页验证搜索效果

### 4.4 API 兼容性

SiliconFlow 的 Embedding API 完全兼容 OpenAI 格式：

```json
// 请求
POST /v1/embeddings
{
  "model": "BAAI/bge-m3",
  "input": "员工请假表单"
}

// 响应
{
  "data": [{ "embedding": [0.012, -0.034, ...], "index": 0 }],
  "model": "BAAI/bge-m3",
  "usage": { "prompt_tokens": 5, "total_tokens": 5 }
}
```

---

## 五、搜索策略

### 5.1 语义搜索（主路径）

```
用户查询 → embedText → 向量
  ↓
遍历 SchemaEmbedding → cosineSimilarity(query, embedding) → score
  ↓
过滤 score >= minScore → 排序 → top-k
```

- 默认 top-k: 5（ragContextRetriever 用 3）
- 默认 minScore: 10（ragContextRetriever 用 15）
- 分数范围: 0-100（cosine * 100）

### 5.2 关键词降级（fallback）

当 Embedding API 未配置或调用失败时，自动降级为 Jaccard 关键词匹配：

```
用户查询 → fuzzySearchSchemas → Jaccard 相似度 → top-k
```

降级触发条件：
- `isEmbeddingConfigured()` 返回 false
- `embedText()` 抛出异常（网络错误、API 限流等）

### 5.3 ragContextRetriever 自动注入

`pluginExpert` 节点在调用 LLM 前，按专家类型经 `expertUserContext` 注入领域上下文，并自动执行 RAG 检索：

```typescript
const { context } = await retrieveRagContext(userMessage, { topK: 3, minScore: 15 })
// context 注入到 system prompt 的 "参考 Schema" 段落
```

跳过条件：用户消息 < 4 字符（问候语、单字等）。

---

## 六、索引管理

### 6.1 增量索引（自动）

Schema/Flow 创建或更新时，Mongoose post-save hook 触发 `scheduleSchemaRagIndex`：
- fire-and-forget，不阻塞主流程
- contentHash 比对，未变更则跳过
- 失败仅 warn 日志，不影响业务

### 6.2 全量重建（手动）

`POST /api/ai/rag/reindex` 遍历所有 Schema 和 Flow，逐一索引：
- 返回统计：created / updated / skipped / errors
- 适用场景：首次接入、切换 embedding 模型、数据迁移后

### 6.3 启动同步

Server 启动时 `scheduleRagStartupSync()` 自动补全缺失索引：
- 只处理无索引的 Schema/Flow，不重建已有索引
- 异步执行，不阻塞服务启动

### 6.4 过期检测

`GET /api/ai/rag/status` 比对 SchemaEmbedding.updatedAt 与 FormSchema.updatedAt：
- 源数据更新时间 > 索引更新时间 → 标记为 stale
- stale 计数展示在管理页摘要卡片

---

## 七、进阶优化路线

### 7.1 混合检索（dense + sparse）

BGE-M3 原生支持 sparse embedding（类似 BM25 的关键词权重），可以实现混合检索：

```
查询 → dense 向量检索 + sparse 关键词检索 → 分数融合 → top-k
```

收益：关键词精确匹配 + 语义理解，召回率显著提升。

前置条件：需要 FlagEmbedding（Python）部署 BGE-M3 获取 sparse 输出。

### 7.2 ColBERT 重排

BGE-M3 的 ColBERT 输出提供 token 级向量，可用于二阶段重排：

```
第一阶段：dense + sparse → 候选集（top-20）
第二阶段：ColBERT 重排 → 最终结果（top-5）
```

收益：精度再上一个台阶，尤其适合长文本匹配。

### 7.3 MongoDB Atlas Vector Search

如果迁移到 MongoDB Atlas，可以用原生 `$vectorSearch` 替代应用层 cosine 计算：
- 数据库层面做 ANN（Approximate Nearest Neighbor）索引
- 大数据量下性能远优于全量遍历

---

## 八、生产部署状态

### 8.1 当前配置

| 配置项 | 值 |
|---|---|
| Embedding 模型 | BAAI/bge-m3 (SiliconFlow 托管) |
| API 端点 | `https://api.siliconflow.cn/v1` |
| 向量维度 | 1024 |
| API Key | 已配置于 `.env.production` |

### 8.2 索引统计

| 指标 | 数量 |
|---|---|
| 总 Schema | 150 |
| 已索引 | 150 |
| 索引覆盖率 | 100% |
| 向量维度 | 1024 |
| Embedding 缓存 | LRU 500 条 |

### 8.3 验证结果

语义搜索测试（查询："搜索请假相关的表单"）：

| 排名 | Schema | 相似度 |
|---|---|---|
| 1 | 请假申请 | 84% |
| 2 | 请假台账 | 79% |
| 3 | 出差申请 | 70% |
| 4 | 加班申请 | 69% |
| 5 | 会议预约 | 68% |

语义理解准确，"请假"相关表单排在最前，"出差""加班"等相近概念也正确匹配。

### 8.4 部署注意事项

1. **PM2 环境变量**：使用 `pm2 delete` + `pm2 start` 而非 `pm2 restart --update-env`
2. **编译代码同步**：TypeScript 编译失败时需手动更新 `dist/` 目录
3. **API 限流**：批量索引时建议添加 200ms 延迟，避免触发 SiliconFlow 限流
4. **contentHash 检测**：相同内容不会重复索引，全量重建安全

/**
 * Requirement Analyzer — runtime pure function.
 *
 * 从 graph/requirementAnalyzer.ts 抽取的业务逻辑，不依赖 LangGraph State。
 * 供 graph node、workflow、API 等多入口复用。
 *
 * 功能保留：RAG 检索增强、completeness 评分、confirmQuestions 生成、工具调用。
 */

import { SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { logger } from '../../utils/logger.js'
import { REQUIREMENT_ANALYZER_TOOLS_PROMPT } from '@schema-platform/platform-shared/ai/toolNames'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface RequirementAnalysisInput {
  /** 用户消息 */
  message: string
  /** 来源上下文：editor / flow / page / standalone */
  contextSource?: string
  /** 是否启用 RAG 检索增强（默认 true） */
  enableRag?: boolean
  /** 是否启用工具调用（默认 true） */
  enableTools?: boolean
  /** completeness 低于此阈值时标记 needsConfirmation（默认 80） */
  completenessThreshold?: number
  /** 指定模型名称，不传则使用 context 默认模型 */
  model?: string
}

export interface RequirementAnalysis {
  /** 用户意图：create / modify / query / help */
  intent: string
  /** 提取的实体列表 */
  entities: Array<{ type: string; value: string }>
  /** 完整性评分 0-100 */
  completeness: number
  /** 确认问题列表 */
  confirmQuestions: string[]
  /** 推荐的专家/Agent 列表 */
  recommendedExperts: string[]
}

/** 依赖注入 — 最小接口，避免硬依赖具体服务 */
export interface RequirementAnalyzerContext {
  /** 获取 LLM 实例，返回的对象需支持 .invoke(messages) */
  getLLM: (opts: {
    model?: string
    temperature?: number
    maxTokens?: number
    jsonMode?: boolean
  }) => Promise<{
    invoke: (messages: unknown[]) => Promise<{
      content: string
      tool_calls?: Array<{
        id: string
        name: string
        args: Record<string, unknown>
      }>
    }>
  }>
  /** RAG 检索函数（可选） */
  ragSearch?: (query: string, limit?: number) => Promise<string>
  /** 执行工具调用（可选，enableTools=true 时需要） */
  callTool?: (name: string, args: Record<string, unknown>) => Promise<string>
  /** 用户 ID（用于日志追踪） */
  userId?: string
}

// ────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────

const REQUIREMENT_ANALYZER_PROMPT = `你是一个需求分析专家，专门分析用户关于表单、流程和页面的需求。

## 你的任务

1. **理解用户意图**
   - create: 创建新的表单/流程/页面
   - modify: 修改现有的表单/流程/页面
   - query: 查询/搜索现有的内容
   - help: 寻求帮助或解释

2. **需求类型分类**
   - form: 纯表单需求
   - flow: 纯流程需求
   - page: 纯页面需求
   - mixed: 混合需求（包含多种类型）
   - general: 通用问答

3. **复杂度评估**
   - simple: 单一实体，字段明确，无需确认
   - medium: 需要少量确认或拆解
   - complex: 多实体关联，需要详细确认

4. **提取实体信息**
   - 表单：名称、用途、字段列表（名称、类型、是否必填）
   - 流程：名称、节点列表（类型、名称、审批人）、条件分支
   - 页面：名称、类型（列表/详情/仪表盘）、组件列表

5. **评估完整性**（0-100 分）
   - 100: 信息完整，可以直接执行
   - 80-99: 信息基本完整，可以执行但有假设
   - 60-79: 信息不足，需要确认关键细节
   - <60: 信息严重不足，需要大量确认

6. **生成确认问题**
   - 针对缺失的信息生成问题
   - 提供选项（如果可能）
   - 标记是否必填

7. **建议推荐专家**
   - editor: 表单/Schema 相关
   - flow: 流程/BPMN 相关
   - page: 页面/列表相关
   - general: 通用问答

## 工具使用

当用户提到现有的流程、表单或页面时，你应该：
1. 使用搜索工具查找相关内容
2. 获取详情以了解当前状态
3. 基于实际数据进行分析

可用的工具：
${REQUIREMENT_ANALYZER_TOOLS_PROMPT}

## 输出格式

请输出严格的 JSON 格式，不要包含任何其他文本：

\`\`\`json
{
  "intent": "create|modify|query|help",
  "type": "form|flow|page|mixed|general",
  "complexity": "simple|medium|complex",
  "entities": [
    {"type": "form|flow|page", "value": "实体描述"}
  ],
  "completeness": {
    "score": 80,
    "missing": ["缺失项1", "缺失项2"],
    "assumptions": ["假设1"]
  },
  "confirmQuestions": ["问题1", "问题2"],
  "recommendedExperts": ["editor", "flow"]
}
\`\`\`
`

// RAG 检索工具名称
const RAG_TOOL_NAME = 'rag__search'

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function parseAnalysisResponse(raw: string): RequirementAnalysis | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logger.error({ msg: '[requirementAnalyzer:runtime] No JSON found in response' })
      return null
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    // 提取 intent
    const intent = typeof parsed.intent === 'string' ? parsed.intent : ''

    // 提取 entities — 兼容两种格式
    let entities: Array<{ type: string; value: string }> = []
    if (Array.isArray(parsed.entities)) {
      entities = parsed.entities as Array<{ type: string; value: string }>
    } else if (parsed.entities && typeof parsed.entities === 'object') {
      // 嵌套格式 { forms: [...], flows: [...], pages: [...] }
      const ent = parsed.entities as Record<string, unknown[]>
      for (const [key, arr] of Object.entries(ent)) {
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const name = typeof item === 'object' && item !== null
              ? (item as Record<string, unknown>).name ?? JSON.stringify(item)
              : String(item)
            entities.push({ type: key.replace(/s$/, ''), value: String(name) })
          }
        }
      }
    }

    // 提取 completeness
    let completeness = 50
    if (typeof parsed.completeness === 'number') {
      completeness = parsed.completeness as number
    } else if (parsed.completeness && typeof parsed.completeness === 'object') {
      const c = parsed.completeness as Record<string, unknown>
      if (typeof c.score === 'number') {
        completeness = c.score
      }
    }

    // 提取 confirmQuestions
    let confirmQuestions: string[] = []
    if (Array.isArray(parsed.confirmQuestions)) {
      confirmQuestions = (parsed.confirmQuestions as unknown[]).map((q) => {
        if (typeof q === 'string') return q
        if (q && typeof q === 'object') {
          const obj = q as Record<string, unknown>
          return typeof obj.question === 'string' ? obj.question : JSON.stringify(q)
        }
        return String(q)
      })
    }

    // 提取 recommendedExperts
    let recommendedExperts: string[] = []
    if (Array.isArray(parsed.recommendedExperts)) {
      recommendedExperts = parsed.recommendedExperts as string[]
    }

    // 兼容旧格式 suggestedChain -> recommendedExperts
    if (recommendedExperts.length === 0 && Array.isArray(parsed.suggestedChain)) {
      recommendedExperts = Array.from(new Set(
        (parsed.suggestedChain as Array<Record<string, unknown>>)
          .map(s => s.agent as string)
          .filter(Boolean),
      ))
    }

    // 兼容旧格式 type 字段作为 recommendedExperts 补充
    if (recommendedExperts.length === 0 && typeof parsed.type === 'string') {
      const typeMap: Record<string, string> = {
        form: 'editor',
        flow: 'flow',
        page: 'page',
      }
      if (typeMap[parsed.type]) {
        recommendedExperts = [typeMap[parsed.type]]
      }
    }

    if (!intent) {
      logger.error({ msg: '[requirementAnalyzer:runtime] Missing required field: intent', parsed })
      return null
    }

    return { intent, entities, completeness, confirmQuestions, recommendedExperts }
  } catch (err) {
    logger.error({ msg: '[requirementAnalyzer:runtime] Failed to parse response', error: err })
    return null
  }
}

function buildContextInfo(
  message: string,
  ragContext: string,
  contextSource?: string,
): string {
  let contextInfo = message

  // 添加 RAG 检索结果
  if (ragContext) {
    contextInfo += `\n\n[RAG 检索结果]\n${ragContext}`
  }

  // 显式模式：告知 LLM 用户已选择的 Agent
  if (contextSource && contextSource !== 'standalone') {
    const agentLabel = contextSource === 'editor' ? '表单编辑器'
      : contextSource === 'flow' ? '流程编辑器'
        : '页面编辑器'
    contextInfo = `[用户已选择使用 ${agentLabel}]\n\n${message}`
    if (ragContext) {
      contextInfo += `\n\n[RAG 检索结果]\n${ragContext}`
    }
  }

  return contextInfo
}

// ────────────────────────────────────────────
// Core
// ────────────────────────────────────────────

/**
 * 纯函数：分析用户需求，返回结构化结果。
 *
 * 与 graph/requirementAnalyzer.ts 的区别：
 * - 不依赖 LangGraph State / Annotation
 * - getLLM / ragSearch / callTool 通过 context 注入
 * - 返回值为扁平的 RequirementAnalysis，而非 Partial<State>
 */
export async function analyzeRequirement(
  input: RequirementAnalysisInput,
  context: RequirementAnalyzerContext,
): Promise<RequirementAnalysis | null> {
  const {
    message,
    contextSource,
    enableRag = true,
    enableTools = true,
    model,
  } = input

  if (!message.trim()) {
    logger.warn({ msg: '[requirementAnalyzer:runtime] Empty message' })
    return null
  }

  logger.info({
    msg: '[requirementAnalyzer:runtime] Analyzing requirement',
    content: message.substring(0, 100),
    contextSource,
    userId: context.userId,
  })

  // ── 第一步：RAG 检索 ──
  let ragContext = ''
  if (enableRag && context.ragSearch) {
    try {
      ragContext = await context.ragSearch(message, 5) ?? ''
      if (ragContext) {
        logger.info({
          msg: '[requirementAnalyzer:runtime] RAG search completed',
          resultLength: ragContext.length,
        })
      }
    } catch (err) {
      logger.warn({ msg: '[requirementAnalyzer:runtime] RAG search failed, continuing', error: err })
    }
  }

  // ── 第二步：LLM 分析 ──
  try {
    const llm = await context.getLLM({
      model,
      temperature: 0,
      maxTokens: 4096,
      jsonMode: true,
    })

    const contextInfo = buildContextInfo(message, ragContext, contextSource)
    const messages = [
      new SystemMessage(REQUIREMENT_ANALYZER_PROMPT),
      new HumanMessage(contextInfo),
    ]

    const firstResponse = await llm.invoke(messages)
    const firstContent = typeof firstResponse.content === 'string' ? firstResponse.content : ''

    // ── 工具调用（可选） ──
    if (enableTools && context.callTool && firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
      logger.info({
        msg: '[requirementAnalyzer:runtime] LLM requested tool calls',
        tools: firstResponse.tool_calls.map(tc => tc.name),
      })

      const toolMessages: ToolMessage[] = []
      for (const toolCall of firstResponse.tool_calls) {
        try {
          const result = await context.callTool(toolCall.name, toolCall.args as Record<string, unknown>)
          toolMessages.push(new ToolMessage({
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: toolCall.id!,
            name: toolCall.name,
          }))
        } catch (err) {
          logger.error({ msg: `[requirementAnalyzer:runtime] Tool call failed: ${toolCall.name}`, error: err })
          toolMessages.push(new ToolMessage({
            content: JSON.stringify({ error: `工具调用失败: ${err}` }),
            tool_call_id: toolCall.id!,
            name: toolCall.name,
          }))
        }
      }

      // 基于工具结果二次分析
      const messagesWithTools = [
        new SystemMessage(REQUIREMENT_ANALYZER_PROMPT),
        new HumanMessage(contextInfo),
        ...toolMessages,
      ]

      const secondResponse = await llm.invoke(messagesWithTools)
      const raw = typeof secondResponse.content === 'string' ? secondResponse.content : ''
      return parseAnalysisResponse(raw)
    }

    // 无工具调用，直接解析
    return parseAnalysisResponse(firstContent)
  } catch (err) {
    logger.error({ msg: '[requirementAnalyzer:runtime] LLM call failed', error: err })
    return null
  }
}

/**
 * 判断是否需要用户确认。
 *
 * 逻辑与 graph 版本一致：complexity !== 'simple' 或 completeness < threshold。
 */
export function needsConfirmation(
  analysis: RequirementAnalysis,
  completenessThreshold = 80,
): boolean {
  // 如果 recommendedExperts 包含多个，说明需求较复杂
  if (analysis.recommendedExperts.length > 1) return true
  return analysis.completeness < completenessThreshold
}

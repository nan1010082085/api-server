/**
 * 意图路由纯函数 — 从 graph.ts routerNode 抽取。
 *
 * 支持两种模式：
 * - explicit：contextSource 直接映射（editor / flow / page）
 * - auto：关键词匹配 + 插件中心 routing 声明
 *
 * 无匹配时使用 fallbackExpertId（默认 platform.general）。
 */

import { logger } from '../../utils/logger.js'
import type { ExpertDeclaration } from '../plugins/types.js'

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface IntentRouterInput {
  message: string
  contextSource?: string
  enableMultiIntentChain?: boolean
  fallbackExpertId?: string
}

export interface IntentRouterOutput {
  expertId: string
  legacyAgentKey: string
  chainPreview?: string[]
  routeReason: string
  /** 当路由匹配到 workflow-expert 时，此字段携带 workflowId */
  workflowId?: string
}

/** 插件中心最小接口 — 避免对 PluginRegistry 硬依赖 */
export interface PluginRegistryLike {
  matchExpertsByRouting(input: {
    text?: string
    contextSource?: string
    runtime?: string
  }): ExpertDeclaration[]
  getExpert(id: string): ExpertDeclaration | undefined
  getExpertByLegacyKey(key: string): ExpertDeclaration | undefined
}

export interface IntentRouterContext {
  registry: PluginRegistryLike
  userId?: string
  tenantId?: string
}

// ────────────────────────────────────────────
// 关键词规则（从 routerNode 抽取）
// ────────────────────────────────────────────

const FLOW_PATTERN = /流程|审批|节点|bpmn|workflow|开始|结束/i
const PAGE_PATTERN = /列表|统计|详情|仪表盘|dashboard|搜索列表|数据表格/i
const FORM_PATTERN = /表单|表|输入|填写|编辑/i
const GENERAL_PATTERN = /你好|你是谁|能做什么|帮助|介绍/i

const DEFAULT_FALLBACK_EXPERT = 'platform.general'

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function expertToLegacyAgentKey(expert: ExpertDeclaration): string {
  return expert.legacyAgentKey ?? 'general'
}

// ────────────────────────────────────────────
// Core
// ────────────────────────────────────────────

/**
 * 纯函数：根据用户消息解析意图，返回目标专家 ID 和路由原因。
 *
 * 路由优先级：
 * 1. explicit — contextSource 直接映射
 * 2. multi-intent chain — page + form / page + flow 关键词共存
 * 3. plugin registry — 按 routing.keywords + contextSources 匹配
 * 4. general greeting — 问候类关键词
 * 5. fallback — 使用 fallbackExpertId（默认 platform.general）
 */
export async function resolveIntent(
  input: IntentRouterInput,
  context: IntentRouterContext,
): Promise<IntentRouterOutput> {
  const { registry } = context
  const fallbackId = input.fallbackExpertId ?? DEFAULT_FALLBACK_EXPERT
  const lower = input.message.toLowerCase()

  // ── 1. 显式模式：contextSource 直接映射 ──
  if (
    input.contextSource === 'editor' ||
    input.contextSource === 'flow' ||
    input.contextSource === 'page'
  ) {
    const legacyKey = input.contextSource
    const expert = registry.getExpertByLegacyKey(legacyKey)
    const expertId = expert?.id ?? fallbackId

    logger.debug({
      msg: 'intentRouter:explicit',
      contextSource: input.contextSource,
      expertId,
    })

    return {
      expertId,
      legacyAgentKey: legacyKey,
      routeReason: `explicit source=${input.contextSource}`,
    }
  }

  // ── 2. 多意图链检测 ──
  const isPage = PAGE_PATTERN.test(lower)
  const isForm = FORM_PATTERN.test(lower)
  const isFlow = FLOW_PATTERN.test(lower)

  if (input.enableMultiIntentChain !== false && isPage && (isForm || isFlow)) {
    const chain = isForm
      ? ['page', 'editor']
      : ['page', 'flow']

    // 取第一个 agent 对应的 expertId
    const firstExpert = registry.getExpertByLegacyKey(chain[0])
    const expertId = firstExpert?.id ?? fallbackId

    logger.info({
      msg: 'intentRouter:multiIntent',
      chain,
      expertId,
    })

    return {
      expertId,
      legacyAgentKey: chain[0],
      chainPreview: chain,
      routeReason: `multi-intent chain: ${chain.join(' -> ')}`,
    }
  }

  // ── 3. 插件中心 routing 匹配 ──
  const matched = registry.matchExpertsByRouting({
    text: lower,
    contextSource: input.contextSource,
    runtime: 'langgraph',
  })

  if (matched.length > 0) {
    const expert = matched[0]
    const legacyKey = expertToLegacyAgentKey(expert)

    logger.debug({
      msg: 'intentRouter:registryMatch',
      expertId: expert.id,
      legacyAgentKey: legacyKey,
    })

    const isWorkflowExpert = expert.id.startsWith('workflow:')
    return {
      expertId: expert.id,
      legacyAgentKey: legacyKey,
      routeReason: `pluginRegistry match: ${expert.id} (key=${legacyKey})`,
      workflowId: isWorkflowExpert ? expert.id.slice('workflow:'.length) : undefined,
    }
  }

  // ── 4. 通用问候 ──
  if (GENERAL_PATTERN.test(lower)) {
    const expert = registry.getExpertByLegacyKey('general')
    const expertId = expert?.id ?? fallbackId

    logger.debug({ msg: 'intentRouter:general', expertId })

    return {
      expertId,
      legacyAgentKey: 'general',
      routeReason: 'general greeting',
    }
  }

  // ── 5. 兜底 ──
  const fallbackExpert = registry.getExpert(fallbackId)
    ?? registry.getExpertByLegacyKey('general')
  const resolvedId = fallbackExpert?.id ?? fallbackId
  const resolvedKey = fallbackExpert ? expertToLegacyAgentKey(fallbackExpert) : 'general'

  logger.debug({
    msg: 'intentRouter:fallback',
    expertId: resolvedId,
  })

  return {
    expertId: resolvedId,
    legacyAgentKey: resolvedKey,
    routeReason: `fallback: no match, using ${resolvedId}`,
  }
}

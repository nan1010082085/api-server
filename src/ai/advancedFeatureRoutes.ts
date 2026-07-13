/**
 * Advanced Feature Routes — 智能建议 / 智能拟办 / 图片生成
 *
 * POST /api/ai/suggestions           — 智能建议
 * POST /api/ai/action-proposals      — 创建拟办
 * PUT  /api/ai/action-proposals/:id/approve — 审批拟办
 * POST /api/ai/generate-image        — 图片生成
 */

import Router from '@koa/router'
import { authMiddleware } from '../middleware/auth.js'
import { getLLM } from './services/llmCache.js'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'
import { ActionProposalModel } from './models/actionProposal.js'

const router = new Router({ prefix: '/api/ai' })

router.use(authMiddleware())

const MAX_PROMPT_LENGTH = 2000
const MAX_CONTENT_LENGTH = 3000

// ────────────────────────────────────────────
// POST /api/ai/suggestions
// ────────────────────────────────────────────

interface SuggestionRequest {
  context?: {
    messages?: Array<{ role: string; content: string }>
    schema?: { fieldCount: number; fields: string[]; hasValidation: boolean }
    flow?: { nodeCount: number; hasStart: boolean; hasEnd: boolean }
    currentView?: string
  }
  maxSuggestions?: number
}

interface SuggestionItem {
  id: string
  type: 'action' | 'optimization' | 'reference'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  targetName?: string
}

router.post('/suggestions', async (ctx) => {
  const body = (ctx.request.body ?? {}) as SuggestionRequest
  const context = body.context ?? {}
  const maxSuggestions = Math.min(Math.max(body.maxSuggestions ?? 1, 1), 5)

  try {
    const llm = await getLLM({ temperature: 0.4, maxTokens: 1024 })

    const contextParts: string[] = []
    if (context.messages?.length) {
      const lastMsg = context.messages[context.messages.length - 1]
      contextParts.push(`最近对话：${lastMsg.role}: ${lastMsg.content.slice(0, 300)}`)
    }
    if (context.schema) {
      const s = context.schema
      contextParts.push(`当前表单：${s.fieldCount} 个字段，字段名：${s.fields.join('、')}，验证规则：${s.hasValidation ? '有' : '无'}`)
    }
    if (context.flow) {
      const f = context.flow
      contextParts.push(`当前流程：${f.nodeCount} 个节点，开始节点：${f.hasStart ? '有' : '无'}，结束节点：${f.hasEnd ? '有' : '无'}`)
    }
    if (context.currentView) {
      contextParts.push(`当前页面：${context.currentView}`)
    }

    const contextStr = contextParts.length > 0 ? contextParts.join('\n') : '暂无上下文'

    const prompt = ChatPromptTemplate.fromTemplate(`你是一个智能助手，根据用户的当前上下文生成操作建议。

当前上下文：
{context}

请生成不超过 {maxSuggestions} 条建议，返回 JSON 数组格式：
[{{"type":"action|optimization|reference","title":"建议标题","description":"具体描述","priority":"high|medium|low","targetName":"可选的目标名称"}}]

要求：
- type: action=操作建议, optimization=优化建议, reference=参考建议
- 优先级按重要性排序
- 建议要具体可执行
- 只返回 JSON 数组，不要其他文字`)

    const chain = prompt.pipe(llm).pipe(new StringOutputParser())
    const result = await chain.invoke({
      context: contextStr,
      maxSuggestions: String(maxSuggestions),
    })

    let suggestions: SuggestionItem[] = []
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>
        suggestions = parsed.slice(0, maxSuggestions).map(() => ({
          id: uuidv4(),
          type: 'action' as SuggestionItem['type'],
          title: '建议',
          description: '',
          priority: 'medium' as SuggestionItem['priority'],
        }))
        // Re-parse with proper field extraction
        suggestions = parsed.slice(0, maxSuggestions).map((item) => ({
          id: uuidv4(),
          type: (['action', 'optimization', 'reference'].includes(item.type as string) ? item.type : 'action') as SuggestionItem['type'],
          title: String(item.title ?? '建议'),
          description: String(item.description ?? ''),
          priority: (['high', 'medium', 'low'].includes(item.priority as string) ? item.priority : 'medium') as SuggestionItem['priority'],
          targetName: item.targetName ? String(item.targetName) : undefined,
        }))
      }
    } catch (parseErr) {
      logger.warn({ msg: '[suggestions] Failed to parse LLM response', error: String(parseErr) })
    }

    ctx.body = { success: true, data: { suggestions } }
  } catch (err) {
    logger.error({ msg: '[suggestions] Error', error: err instanceof Error ? err.message : String(err) })
    ctx.status = 500
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Failed to generate suggestions' },
    }
  }
})

// ────────────────────────────────────────────
// POST /api/ai/action-proposals
// ────────────────────────────────────────────

interface ActionProposalRequest {
  content?: string
  documentTitle?: string
  context?: string
}

router.post('/action-proposals', async (ctx) => {
  const userId = ctx.state.user?.id ?? ctx.state.user?.userId ?? 'anonymous'
  const body = (ctx.request.body ?? {}) as ActionProposalRequest

  if (!body.content?.trim()) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'content is required' } }
    return
  }

  try {
    const llm = await getLLM({ temperature: 0.3, maxTokens: 2048 })

    const prompt = ChatPromptTemplate.fromTemplate(`你是一个智能拟办助手，从文档或对话内容中提取行动项。

内容：
{content}

{context}

请提取行动项，返回 JSON 格式：
{{"summary":"总体摘要","actionItems":[{{"title":"行动项标题","description":"具体描述","assignee":"负责人(可选)","deadline":"截止日期(可选)","priority":"high|medium|low","type":"todo|approval|review|decision"}}],"approvalChain":["审批人1","审批人2(可选)"]}}

要求：
- type: todo=待办, approval=审批, review=审阅, decision=决策
- 优先级按紧急程度排序
- 描述要具体可操作
- 只返回 JSON，不要其他文字`)

    const chain = prompt.pipe(llm).pipe(new StringOutputParser())
    const result = await chain.invoke({
      content: body.content.slice(0, MAX_CONTENT_LENGTH),
      context: body.context ? `补充上下文：${body.context}` : '',
    })

    let proposalDoc: InstanceType<typeof ActionProposalModel> | null = null
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        const items = (parsed.actionItems ?? []) as Array<Record<string, unknown>>
        proposalDoc = await ActionProposalModel.create({
          userId,
          documentTitle: body.documentTitle,
          summary: String(parsed.summary ?? ''),
          actionItems: items.slice(0, 20).map(() => ({
            id: uuidv4(),
            title: '',
            description: '',
            priority: 'medium',
            type: 'todo',
          })),
          approvalChain: Array.isArray(parsed.approvalChain) ? parsed.approvalChain.map(String) : [],
          status: 'pending',
        })
        // Re-parse items properly
        const actionItems = items.slice(0, 20).map((item) => ({
          id: uuidv4(),
          title: String(item.title ?? '行动项'),
          description: String(item.description ?? ''),
          assignee: item.assignee ? String(item.assignee) : undefined,
          deadline: item.deadline ? String(item.deadline) : undefined,
          priority: (['high', 'medium', 'low'].includes(item.priority as string) ? item.priority : 'medium') as 'high' | 'medium' | 'low',
          type: (['todo', 'approval', 'review', 'decision'].includes(item.type as string) ? item.type : 'todo') as 'todo' | 'approval' | 'review' | 'decision',
        }))
        proposalDoc.actionItems = actionItems
        await proposalDoc.save()
      }
    } catch (parseErr) {
      logger.warn({ msg: '[action-proposals] Failed to parse LLM response', error: String(parseErr) })
    }

    if (!proposalDoc) {
      ctx.status = 500
      ctx.body = { success: false, error: { message: 'Failed to generate action proposals' } }
      return
    }

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        id: String(proposalDoc._id),
        documentTitle: proposalDoc.documentTitle,
        summary: proposalDoc.summary,
        actionItems: proposalDoc.actionItems,
        approvalChain: proposalDoc.approvalChain,
        status: proposalDoc.status,
      },
    }
  } catch (err) {
    logger.error({ msg: '[action-proposals] Error', error: err instanceof Error ? err.message : String(err) })
    ctx.status = 500
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Failed to create action proposals' },
    }
  }
})

// ────────────────────────────────────────────
// PUT /api/ai/action-proposals/:id/approve
// ────────────────────────────────────────────

router.put('/action-proposals/:id/approve', async (ctx) => {
  const { id } = ctx.params
  const body = (ctx.request.body ?? {}) as { selectedIds?: string[]; action?: 'approve' | 'reject' }

  const proposal = await ActionProposalModel.findById(id)
  if (!proposal) {
    ctx.status = 404
    ctx.body = { success: false, error: { message: 'Proposal not found' } }
    return
  }

  if (proposal.status !== 'pending') {
    ctx.status = 400
    ctx.body = { success: false, error: { message: `Proposal already ${proposal.status}` } }
    return
  }

  const action = body.action ?? 'approve'
  proposal.status = action === 'approve' ? 'approved' : 'rejected'
  proposal.selectedIds = body.selectedIds ?? []
  await proposal.save()

  ctx.body = {
    success: true,
    data: {
      id: String(proposal._id),
      status: proposal.status,
      selectedItems: body.selectedIds?.length
        ? proposal.actionItems.filter((item: { id: string }) => body.selectedIds!.includes(item.id))
        : proposal.actionItems,
    },
  }
})

// ────────────────────────────────────────────
// POST /api/ai/generate-image
// ────────────────────────────────────────────

router.post('/generate-image', async (ctx) => {
  const body = (ctx.request.body ?? {}) as {
    prompt?: string
    model?: string
    size?: string
    style?: string
    quality?: string
  }

  const promptText = body.prompt?.trim()
  if (!promptText) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: 'prompt is required' } }
    return
  }

  if (promptText.length > MAX_PROMPT_LENGTH) {
    ctx.status = 400
    ctx.body = { success: false, error: { message: `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` } }
    return
  }

  const imageApiKey = process.env.OPENAI_API_KEY || process.env.IMAGE_GENERATION_API_KEY
  const imageBaseUrl = process.env.IMAGE_GENERATION_BASE_URL || 'https://api.openai.com/v1'

  if (!imageApiKey) {
    ctx.status = 501
    ctx.body = {
      success: false,
      error: {
        message: '图片生成 API 未配置。请在 .env 中设置 OPENAI_API_KEY 或 IMAGE_GENERATION_API_KEY。',
        code: 'IMAGE_API_NOT_CONFIGURED',
      },
    }
    return
  }

  try {
    const model = body.model ?? 'dall-e-3'
    const size = body.size ?? '1024x1024'
    const style = body.style ?? 'vivid'
    const quality = body.quality ?? 'standard'

    const response = await fetch(`${imageBaseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imageApiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: promptText,
        n: 1,
        size,
        style,
        quality,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      logger.error({ msg: '[generate-image] API error', status: response.status, body: errBody })
      ctx.status = response.status
      ctx.body = {
        success: false,
        error: { message: `Image generation API error: ${response.status}` },
      }
      return
    }

    const data = await response.json() as { data: Array<{ url: string }> }
    const imageUrl = data.data?.[0]?.url

    if (!imageUrl) {
      ctx.status = 500
      ctx.body = { success: false, error: { message: 'No image URL in response' } }
      return
    }

    ctx.body = {
      success: true,
      data: {
        imageUrl,
        prompt: promptText,
        model,
        size,
        style,
        quality,
      },
    }
  } catch (err) {
    logger.error({ msg: '[generate-image] Error', error: err instanceof Error ? err.message : String(err) })
    ctx.status = 500
    ctx.body = {
      success: false,
      error: { message: err instanceof Error ? err.message : 'Image generation failed' },
    }
  }
})

export default router

/**
 * Seed official demo Agent workflows for template "试用" feature.
 *
 * Creates four demo workflows (idempotent):
 * - demo-intelligent-assistant
 * - demo-document-summary
 * - demo-doc-image
 * - demo-chat-parity
 *
 * These are published workflows that users can directly try from the template tab.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  createIntelligentAssistantWorkflowGraph,
  createDocumentSummaryWorkflowGraph,
  createDocImageRecognitionWorkflowGraph,
  createChatParityAssistantWorkflowGraph,
} from '@schema-platform/platform-shared/ai'
import { AgentWorkflowModel } from '../ai/models/agentWorkflow.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

interface DemoWorkflowSpec {
  slug: string
  name: string
  description: string
  buildGraph: () => ReturnType<typeof createIntelligentAssistantWorkflowGraph>
}

const DEMO_WORKFLOWS: DemoWorkflowSpec[] = [
  {
    slug: 'demo-intelligent-assistant',
    name: '智能助手问答 Demo',
    description: 'RAG 检索知识库后由 LLM 生成帮助回答，可直接在对话中体验。',
    buildGraph: createIntelligentAssistantWorkflowGraph,
  },
  {
    slug: 'demo-document-summary',
    name: '文档摘要 Demo',
    description: 'Webhook 接收 documentId，解析后生成结构化摘要，可直接在对话中体验。',
    buildGraph: createDocumentSummaryWorkflowGraph,
  },
  {
    slug: 'demo-doc-image',
    name: '文档图片识别 Demo',
    description: '解析上传文件，图片走 OCR 分支，文档走结构化提取，可直接在对话中体验。',
    buildGraph: createDocImageRecognitionWorkflowGraph,
  },
  {
    slug: 'demo-chat-parity',
    name: '智能助手 v2 Demo',
    description: '意图路由 → 需求分析 → 人工确认 → 任务规划 → 多专家协作 → 摘要输出，可直接在对话中体验。',
    buildGraph: createChatParityAssistantWorkflowGraph,
  },
]

function versionStamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * Seed demo Agent workflows (idempotent).
 * Skips if a workflow with the same slug already exists.
 */
export async function seedDemoWorkflows(): Promise<number> {
  let created = 0

  for (const spec of DEMO_WORKFLOWS) {
    const existing = await AgentWorkflowModel.findOne({
      tenantId: DEFAULT_TENANT_ID,
      slug: spec.slug,
    })
    if (existing) continue

    const graph = spec.buildGraph()
    const version = versionStamp()

    await AgentWorkflowModel.create({
      tenantId: DEFAULT_TENANT_ID,
      name: spec.name,
      description: spec.description,
      slug: spec.slug,
      status: 'published',
      draftGraph: graph,
      version,
      versions: [{ version, createdAt: new Date(), graph }],
      publishId: uuidv4(),
      publishedVersion: version,
      publishedGraph: graph,
      createdBy: 'system',
    })
    created++
    console.log(`[seed] Demo workflow created: ${spec.slug} (${spec.name})`)
  }

  return created
}

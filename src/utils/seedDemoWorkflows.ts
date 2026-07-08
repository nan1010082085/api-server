/**
 * Seed official demo Agent workflows for template "试用" feature.
 *
 * Creates three demo workflows (idempotent):
 * - demo-intelligent-assistant
 * - demo-document-summary
 * - demo-doc-image
 *
 * These are published workflows that users can directly try from the template tab.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  createIntelligentAssistantWorkflowGraph,
  createDocumentSummaryWorkflowGraph,
  createDocImageRecognitionWorkflowGraph,
} from '@schema-platform/ai-shared'
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

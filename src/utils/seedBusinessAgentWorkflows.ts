import { v4 as uuidv4 } from 'uuid'
import {
  createIntelligentAssistantWorkflowGraph,
  createDocumentSummaryWorkflowGraph,
  createDocImageRecognitionWorkflowGraph,
} from '@schema-platform/platform-shared/ai'
import { AgentWorkflowModel } from '../ai/models/agentWorkflow.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

interface BusinessAgentSpec {
  code: string
  name: string
  description: string
  buildGraph: () => ReturnType<typeof createIntelligentAssistantWorkflowGraph>
}

const BUSINESS_AGENTS: BusinessAgentSpec[] = [
  {
    code: 'policy-qa',
    name: '制度问答',
    description: 'RAG 检索制度知识库后回答员工政策问题（A-05）',
    buildGraph: createIntelligentAssistantWorkflowGraph,
  },
  {
    code: 'approval-summary',
    name: '审批摘要',
    description: '根据表单与流程上下文生成审批摘要建议',
    buildGraph: createDocumentSummaryWorkflowGraph,
  },
  {
    code: 'meeting-minutes',
    name: '会议纪要',
    description: '根据会议内容生成结构化纪要',
    buildGraph: createDocumentSummaryWorkflowGraph,
  },
  {
    code: 'doc-draft',
    name: '公文拟稿',
    description: '辅助起草公文与制度文档',
    buildGraph: createIntelligentAssistantWorkflowGraph,
  },
  {
    code: 'doc-ocr',
    name: '文档 OCR',
    description: '识别扫描件与图片中的文字（A-04）',
    buildGraph: createDocImageRecognitionWorkflowGraph,
  },
]

function versionStamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `v${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/**
 * A-05 — Seed business Agent workflows from platform templates (idempotent).
 */
export async function seedBusinessAgentWorkflows(): Promise<number> {
  let created = 0

  for (const spec of BUSINESS_AGENTS) {
    const existing = await AgentWorkflowModel.findOne({
      tenantId: DEFAULT_TENANT_ID,
      name: spec.name,
    })
    if (existing) continue

    const graph = spec.buildGraph()
    const version = versionStamp()

    await AgentWorkflowModel.create({
      tenantId: DEFAULT_TENANT_ID,
      name: spec.name,
      description: spec.description,
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
    console.log(`[seed] Business agent workflow created: ${spec.code} (${spec.name})`)
  }

  return created
}

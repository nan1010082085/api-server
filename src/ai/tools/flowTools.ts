/**
 * Flow Agent 专有工具 — LangGraph StructuredTool format.
 *
 * 仅保留依赖图状态的工具（HITL interrupt、复合写入、LLM 调用）。
 * 读取/校验类工具已迁入 MCP Server（flow__*、schema__*），通过 registry 获取。
 */

import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
import { FlowDefinitionModel } from '../../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../../flow-models/FlowVersion.js'
import { FormSchemaModel } from '../../models/FormSchema.js'
import { generateSchemaFromPrompt } from './schemaGenerator.js'
import { adaptFlowGraph, type PartialFlowGraph } from '../services/flowAdapter.js'
import { validateFlowGraph } from '../services/flowService.js'
import { z } from 'zod'
import type { ToolResult } from './types.js'

// ────────────────────────────────────────────
// Generate Schema Tool（LLM 调用）
// ────────────────────────────────────────────

export const generateSchemaTool = tool(
  async ({ description }): Promise<string> => {
    try {
      const generated = await generateSchemaFromPrompt(description)
      return JSON.stringify({ success: true, data: { schemaId: generated.tempId, widgets: generated.widgets, summary: generated.summary } })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return JSON.stringify({ success: false, error: `Schema 生成失败: ${message}` } satisfies ToolResult)
    }
  },
  {
    name: 'generate_schema',
    description: `调用 Editor Agent 生成一个表单 Schema。参数：description — 表单的自然语言描述。`,
    schema: z.object({ description: z.string().describe('表单的自然语言描述') }),
  },
)

// ────────────────────────────────────────────
// 复合写入工具
// ────────────────────────────────────────────

export const saveAndBindSchemaTool = tool(
  async ({ widgets, schemaName, flowId, nodeId }): Promise<string> => {
    const { v4: uuidv4 } = await import('uuid')
    const editId = uuidv4()
    const now = new Date()
    const version = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('')
    const name = schemaName || `AI Generated ${now.toISOString()}`

    const schema = await FormSchemaModel.create({ editId, version, name, type: 'form', status: 'draft', json: widgets })
    const { PublishedSchemaModel } = await import('../../models/PublishedSchema.js')
    const publishId = uuidv4()
    await PublishedSchemaModel.create({ sourceId: editId, publishId, name: schema.name, type: schema.type, json: schema.json, version: schema.version, publishedAt: now })

    let bindingResult: Record<string, unknown> | undefined
    if (flowId && nodeId) bindingResult = await bindSchemaToFlowNode(flowId, nodeId, schema._id, publishId, version)

    return JSON.stringify({
      success: true,
      data: { schemaId: schema._id, editId, publishId, name, version, binding: bindingResult },
      summary: flowId && nodeId ? `已创建并绑定 Schema "${name}"` : `已创建 Schema "${name}"`,
    } satisfies ToolResult)
  },
  {
    name: 'save_and_bind_schema',
    description: `将生成的 Schema 持久化到数据库，并可选地绑定到流程节点。`,
    schema: z.object({
      widgets: z.array(z.record(z.unknown())).describe('Widget Schema JSON 数组'),
      schemaName: z.string().optional().describe('Schema 名称'),
      flowId: z.string().optional().describe('要绑定的流程定义 ID'),
      nodeId: z.string().optional().describe('要绑定的流程节点 ID'),
    }),
  },
)

export const bindSchemaToFlowNodeTool = tool(
  async ({ flowId, nodeId, schemaId }): Promise<string> => {
    const schema = await FormSchemaModel.findById(schemaId).select('_id editId name version').lean() as Record<string, unknown> | null
    if (!schema) return JSON.stringify({ success: false, error: `Schema ${schemaId} not found` } satisfies ToolResult)

    const { PublishedSchemaModel } = await import('../../models/PublishedSchema.js')
    const published = await PublishedSchemaModel.findOne({ sourceId: schema.editId }).sort({ publishedAt: -1 }).select('publishId version').lean() as Record<string, unknown> | null
    const publishId = (published?.publishId as string) ?? ''
    const version = (published?.version as string) ?? (schema.version as string) ?? ''

    const binding = await bindSchemaToFlowNode(flowId, nodeId, schemaId, publishId, version)
    return JSON.stringify({ success: true, data: { ...binding, schemaName: schema.name }, summary: `已将 Schema "${schema.name}" 绑定到节点 ${nodeId}` } satisfies ToolResult)
  },
  {
    name: 'bind_schema_to_flow_node',
    description: `将已有 Schema 绑定到流程的 userTask 节点。参数：flowId、nodeId、schemaId。`,
    schema: z.object({
      flowId: z.string().describe('流程定义 ID'),
      nodeId: z.string().describe('要绑定的节点 ID'),
      schemaId: z.string().describe('要绑定的 Schema ID'),
    }),
  },
)

// ────────────────────────────────────────────
// Flow Diff + Update（HITL 逻辑）
// ────────────────────────────────────────────

interface FlowDiffEntry {
  type: 'add_node' | 'remove_node' | 'modify_node' | 'add_edge' | 'remove_edge' | 'modify_edge'
  elementId: string
  elementType: 'node' | 'edge'
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  summary: string
}

interface FlowDiff {
  changes: FlowDiffEntry[]
  nodesAdded: number; nodesRemoved: number; nodesModified: number
  edgesAdded: number; edgesRemoved: number; edgesModified: number
}

export function computeFlowDiff(
  oldFlow: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] },
  newFlow: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] },
): FlowDiff {
  const changes: FlowDiffEntry[] = []
  let nodesAdded = 0, nodesRemoved = 0, nodesModified = 0, edgesAdded = 0, edgesRemoved = 0, edgesModified = 0

  const oldNodeMap = new Map(oldFlow.nodes.map((n) => [n.id as string, n]))
  const newNodeMap = new Map(newFlow.nodes.map((n) => [n.id as string, n]))

  for (const [id, node] of oldNodeMap) {
    if (!newNodeMap.has(id)) { nodesRemoved++; changes.push({ type: 'remove_node', elementId: id, elementType: 'node', before: node, summary: `删除了节点 "${(node.data as Record<string, unknown>)?.label ?? id}"` }) }
  }
  for (const [id, node] of newNodeMap) {
    const oldNode = oldNodeMap.get(id)
    if (!oldNode) { nodesAdded++; changes.push({ type: 'add_node', elementId: id, elementType: 'node', after: node, summary: `新增了节点 "${(node.data as Record<string, unknown>)?.label ?? id}"` }) }
    else if (JSON.stringify(oldNode.data) !== JSON.stringify(node.data)) {
      nodesModified++
      const oldD = (oldNode.data ?? {}) as Record<string, unknown>; const newD = (node.data ?? {}) as Record<string, unknown>
      const changedKeys = Object.keys({ ...oldD, ...newD }).filter(k => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
      changes.push({ type: 'modify_node', elementId: id, elementType: 'node', before: oldNode, after: node, summary: `修改了节点 "${(node.data as Record<string, unknown>)?.label ?? id}" 的 ${changedKeys.join('、')} 属性` })
    }
  }

  const oldEdgeMap = new Map(oldFlow.edges.map((e) => [e.id as string, e]))
  const newEdgeMap = new Map(newFlow.edges.map((e) => [e.id as string, e]))
  for (const [id, edge] of oldEdgeMap) { if (!newEdgeMap.has(id)) { edgesRemoved++; changes.push({ type: 'remove_edge', elementId: id, elementType: 'edge', before: edge, summary: `删除了连线 ${id}` }) } }
  for (const [id, edge] of newEdgeMap) {
    const oldEdge = oldEdgeMap.get(id)
    if (!oldEdge) { edgesAdded++; changes.push({ type: 'add_edge', elementId: id, elementType: 'edge', after: edge, summary: `新增了连线 ${id}` }) }
    else if (JSON.stringify(oldEdge) !== JSON.stringify(edge)) { edgesModified++; changes.push({ type: 'modify_edge', elementId: id, elementType: 'edge', before: oldEdge, after: edge, summary: `修改了连线 ${id}` }) }
  }

  return { changes, nodesAdded, nodesRemoved, nodesModified, edgesAdded, edgesRemoved, edgesModified }
}

export const updateFlowTool = tool(
  async ({ flow, flowId, description }): Promise<string> => {
    const adapted = adaptFlowGraph(flow as unknown as PartialFlowGraph)
    const flowGraph = adapted as unknown as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }

    const validationResult = validateFlowGraph(flowGraph)
    if (!validationResult.valid) return JSON.stringify({ success: false, error: `流程校验失败` } satisfies ToolResult)

    let diff: FlowDiff | null = null
    if (flowId) {
      const definition = await FlowDefinitionModel.findById(flowId).select('currentVersionId').lean() as Record<string, unknown> | null
      if (definition?.currentVersionId) {
        const currentVersion = await FlowVersionModel.findById(definition.currentVersionId).select('graph').lean() as Record<string, unknown> | null
        if (currentVersion?.graph) diff = computeFlowDiff(currentVersion.graph as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }, flowGraph)
      }
    }

    const diffSummary = diff
      ? `变更：节点 +${diff.nodesAdded} -${diff.nodesRemoved} ~${diff.nodesModified}，连线 +${diff.edgesAdded} -${diff.edgesRemoved} ~${diff.edgesModified}`
      : `流程包含 ${flowGraph.nodes.length} 个节点、${flowGraph.edges.length} 条边`

    const confirmed = interrupt({
      type: 'flow_update',
      message: `确认更新流程？${diffSummary}`,
      data: { flowId, description, diff: diff ? { nodesAdded: diff.nodesAdded, nodesRemoved: diff.nodesRemoved, nodesModified: diff.nodesModified, edgesAdded: diff.edgesAdded, edgesRemoved: diff.edgesRemoved, edgesModified: diff.edgesModified, changes: diff.changes.slice(0, 10) } : null, nodeCount: flowGraph.nodes.length, edgeCount: flowGraph.edges.length },
    })
    if (!confirmed) return JSON.stringify({ success: false, error: '用户取消操作' } satisfies ToolResult)

    if (flowId) {
      const now = new Date()
      const pad = (n: number, len: number) => String(n).padStart(len, '0')
      const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`
      const newVersion = await FlowVersionModel.create({ definitionId: flowId, version: nextVersion, graph: flowGraph })
      await FlowDefinitionModel.findByIdAndUpdate(flowId, { currentVersionId: newVersion._id })
    }

    return JSON.stringify({ success: true, data: { flow: flowGraph, flowId, diff, description }, summary: diffSummary } satisfies ToolResult)
  },
  {
    name: 'update_flow',
    description: `增量更新已有的流程。参数：flow — 修改后的完整 FlowGraph；flowId — 要更新的流程定义 ID；description — 本次修改的自然语言描述。`,
    schema: z.object({
      flow: z.object({ nodes: z.array(z.record(z.unknown())), edges: z.array(z.record(z.unknown())) }).describe('修改后的完整 FlowGraph'),
      flowId: z.string().optional().describe('要更新的流程定义 ID'),
      description: z.string().describe('本次修改的自然语言描述'),
    }),
  },
)

// ────────────────────────────────────────────
// Flow 专有工具集合
// ────────────────────────────────────────────

export const flowOnlyTools = [
  generateSchemaTool,
  saveAndBindSchemaTool,
  bindSchemaToFlowNodeTool,
  updateFlowTool,
]

// ────────────────────────────────────────────
// Shared helper
// ────────────────────────────────────────────

async function bindSchemaToFlowNode(
  flowId: string, nodeId: string, schemaId: string, publishId: string, version: string,
): Promise<Record<string, unknown>> {
  const flowVersion = await FlowVersionModel.findOne({ definitionId: flowId }).sort({ version: -1 }).lean() as Record<string, unknown> | null
  if (!flowVersion?.graph) throw new Error(`Flow ${flowId} has no version`)

  const graph = flowVersion.graph as Record<string, unknown>
  const nodes = (graph.nodes ?? []) as Array<Record<string, unknown>>
  const nodeIndex = nodes.findIndex((n) => n.id === nodeId)
  if (nodeIndex === -1) throw new Error(`Node ${nodeId} not found in flow ${flowId}`)

  const nodeData = nodes[nodeIndex].data as Record<string, unknown>
  if (nodeData.bpmnType !== 'userTask') throw new Error(`Node ${nodeId} is not a userTask`)

  const updatedNodes = [...nodes]
  updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], data: { ...nodeData, formSchemaId: schemaId, formPublishId: publishId, formVersion: version, formMode: nodeData.formMode ?? 'edit' } }

  const now = new Date()
  const pad = (n: number, len: number) => String(n).padStart(len, '0')
  const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

  const newVersion = await FlowVersionModel.create({ definitionId: flowId, version: nextVersion, graph: { nodes: updatedNodes, edges: (graph.edges as unknown[]) ?? [] } })
  await FlowDefinitionModel.findByIdAndUpdate(flowId, { currentVersionId: newVersion._id })

  return { flowId, nodeId, schemaId, publishId, flowVersionId: newVersion._id, flowVersion: nextVersion }
}

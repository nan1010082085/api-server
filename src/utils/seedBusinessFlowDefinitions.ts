/**
 * Seed published FlowDefinitions from built-in templates.
 */
import { v4 as uuidv4 } from 'uuid'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../flow-models/FlowVersion.js'
import { FlowTemplateModel } from '../flow-models/FlowTemplate.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import { resolveLeaveFlowGraphRoles } from './seedBusinessRoles.js'
import {
  ASSET_FLOW_NAME,
  DOC_FLOW_NAME,
  EXPENSE_FLOW_NAME,
  GOV_PARALLEL_FLOW_NAME,
  LEAVE_FLOW_NAME,
  ONBOARD_FLOW_NAME,
  OVERTIME_FLOW_NAME,
  PURCHASE_FLOW_NAME,
  RECRUIT_FLOW_NAME,
  RECRUIT_OFFER_FLOW_NAME,
  RESIGN_FLOW_NAME,
  SEAL_FLOW_NAME,
  TRIP_FLOW_NAME,
} from './builtinFlowGraphs.js'

function remapGraphIds(graph: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }) {
  const idMap = new Map<string, string>()
  const nodes = graph.nodes.map((node) => {
    const newId = uuidv4()
    idMap.set(node.id as string, newId)
    return { ...node, id: newId }
  })
  const edges = graph.edges.map((edge) => ({
    ...edge,
    id: uuidv4(),
    data: {
      label: '',
      ...(typeof edge.data === 'object' && edge.data !== null ? edge.data : {}),
    },
    source: {
      ...(edge.source as Record<string, unknown>),
      cell: idMap.get((edge.source as Record<string, unknown>).cell as string)
        ?? (edge.source as Record<string, unknown>).cell,
    },
    target: {
      ...(edge.target as Record<string, unknown>),
      cell: idMap.get((edge.target as Record<string, unknown>).cell as string)
        ?? (edge.target as Record<string, unknown>).cell,
    },
  }))
  const remapped = { nodes, edges }
  return remapped
}

async function remapAndResolveGraph(graph: {
  nodes: Array<Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}) {
  const remapped = remapGraphIds(graph)
  await resolveLeaveFlowGraphRoles(remapped)
  return remapped
}

export async function ensurePublishedFlowDefinition(templateName: string): Promise<string | null> {
  const existing = await FlowDefinitionModel.findOne({
    tenantId: DEFAULT_TENANT_ID,
    name: templateName,
  })

  if (existing) {
    const template = await FlowTemplateModel.findOne({ name: templateName, isBuiltin: true })
    if (template?.graph && existing.currentVersionId) {
      const graph = await remapAndResolveGraph(
        template.graph as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> },
      )
      await FlowVersionModel.updateOne({ _id: existing.currentVersionId }, { $set: { graph } })
    }
    if (existing.status !== 'published' && existing.currentVersionId) {
      existing.status = 'published'
      await existing.save()
    }
    return String(existing._id)
  }

  const template = await FlowTemplateModel.findOne({ name: templateName, isBuiltin: true })
  if (!template?.graph) {
    console.warn(`[seed] Flow template not found: ${templateName}`)
    return null
  }

  const graph = await remapAndResolveGraph(
    template.graph as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> },
  )
  const now = new Date()
  const pad = (n: number, len: number) => String(n).padStart(len, '2')
  const version = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

  const definition = await FlowDefinitionModel.create({
    tenantId: DEFAULT_TENANT_ID,
    name: templateName,
    description: template.description,
    category: template.category,
    status: 'published',
    createdBy: 'system',
    permissions: { editors: [], launchers: [], viewers: [] },
  })

  const flowVersion = await FlowVersionModel.create({
    definitionId: definition._id,
    version,
    graph,
    metadata: null,
  })

  definition.currentVersionId = String(flowVersion._id)
  await definition.save()
  console.log(`[seed] Flow definition created: ${templateName}`)
  return String(definition._id)
}

export async function seedBusinessFlowDefinitions(): Promise<Record<string, string>> {
  const templateNames = [
    LEAVE_FLOW_NAME,
    TRIP_FLOW_NAME,
    EXPENSE_FLOW_NAME,
    PURCHASE_FLOW_NAME,
    OVERTIME_FLOW_NAME,
    GOV_PARALLEL_FLOW_NAME,
    SEAL_FLOW_NAME,
    ONBOARD_FLOW_NAME,
    RESIGN_FLOW_NAME,
    DOC_FLOW_NAME,
    RECRUIT_FLOW_NAME,
    RECRUIT_OFFER_FLOW_NAME,
    ASSET_FLOW_NAME,
  ]
  const ids: Record<string, string> = {}
  for (const name of templateNames) {
    const id = await ensurePublishedFlowDefinition(name)
    if (id) ids[name] = id
  }
  return ids
}

import { v4 as uuidv4 } from 'uuid'
import { FormSchemaModel } from '../models/FormSchema.js'
import { PublishedSchemaModel } from '../models/PublishedSchema.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../flow-models/FlowVersion.js'
import { FlowTemplateModel } from '../flow-models/FlowTemplate.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import { bindMenuSchemaIds } from './seedMenus.js'
import {
  BUSINESS_SCHEMA_SEEDS,
  LEAVE_FLOW_DEFINITION_NAME,
  type BusinessSchemaSeedSpec,
} from './businessSchemaStubs.js'

export interface SeededBusinessSchema {
  code: string
  formSchemaId: string
  editId: string
  publishId: string
}

export interface BusinessSeedResult {
  schemas: SeededBusinessSchema[]
  leaveFlowDefinitionId: string | null
}

async function publishFormSchema(
  draft: { _id: string; editId: string; name: string; type: string; json: Record<string, unknown>; version: string },
): Promise<string> {
  const existing = await PublishedSchemaModel.findOne({ sourceId: draft.editId })
  const publishId = existing?.publishId ?? uuidv4()
  const now = new Date()

  await PublishedSchemaModel.findOneAndUpdate(
    { sourceId: draft.editId },
    {
      $set: {
        name: draft.name,
        type: draft.type,
        json: draft.json,
        publishId,
        version: draft.version,
        publishedAt: now,
        tenantId: DEFAULT_TENANT_ID,
      },
      $setOnInsert: {
        sourceId: draft.editId,
      },
    },
    { upsert: true, new: true },
  )

  return publishId
}

async function upsertBusinessSchema(spec: BusinessSchemaSeedSpec): Promise<SeededBusinessSchema | null> {
  const existing = await FormSchemaModel.findOne({ tenantId: DEFAULT_TENANT_ID, code: spec.code })

  if (existing) {
    const published = await PublishedSchemaModel.findOne({ sourceId: existing.editId })
    if (!published) {
      const publishId = await publishFormSchema(existing)
      return {
        code: spec.code,
        formSchemaId: String(existing._id),
        editId: existing.editId,
        publishId,
      }
    }
    return {
      code: spec.code,
      formSchemaId: String(existing._id),
      editId: existing.editId,
      publishId: published.publishId,
    }
  }

  const editId = uuidv4()
  const draft = await FormSchemaModel.create({
    tenantId: DEFAULT_TENANT_ID,
    editId,
    code: spec.code,
    version: 'v1',
    name: spec.name,
    type: spec.type,
    status: 'draft',
    json: spec.json,
    createdBy: null,
    versions: [],
  })

  const publishId = await publishFormSchema(draft)
  console.log(`[seed] Business schema created: ${spec.code} (${spec.name})`)

  return {
    code: spec.code,
    formSchemaId: String(draft._id),
    editId: draft.editId,
    publishId,
  }
}

async function seedLeaveFlowDefinition(): Promise<string | null> {
  const existing = await FlowDefinitionModel.findOne({
    tenantId: DEFAULT_TENANT_ID,
    name: LEAVE_FLOW_DEFINITION_NAME,
  })
  if (existing) {
    if (existing.status !== 'published') {
      const latestVersion = await FlowVersionModel.findOne({ definitionId: existing._id }).sort({ version: -1 })
      if (latestVersion) {
        existing.status = 'published'
        existing.currentVersionId = String(latestVersion._id)
        await existing.save()
      }
    }
    return String(existing._id)
  }

  const template = await FlowTemplateModel.findOne({ name: LEAVE_FLOW_DEFINITION_NAME, isBuiltin: true })
  if (!template) {
    console.warn('[seed] Leave flow template not found — run flow template seed first')
    return null
  }

  const idMap = new Map<string, string>()
  const nodes = template.graph.nodes.map((node: Record<string, unknown>) => {
    const newId = uuidv4()
    idMap.set(node.id as string, newId)
    return { ...node, id: newId }
  })
  const edges = template.graph.edges.map((edge: Record<string, unknown>) => ({
    ...edge,
    id: uuidv4(),
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

  const now = new Date()
  const pad = (n: number, len: number) => String(n).padStart(len, '2')
  const nextVersion = `v${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`

  const definition = await FlowDefinitionModel.create({
    tenantId: DEFAULT_TENANT_ID,
    name: LEAVE_FLOW_DEFINITION_NAME,
    description: template.description,
    category: template.category,
    status: 'published',
    createdBy: 'system',
    permissions: { editors: [], launchers: [], viewers: [] },
  })

  const version = await FlowVersionModel.create({
    definitionId: definition._id,
    version: nextVersion,
    graph: { nodes, edges },
    metadata: null,
  })

  definition.currentVersionId = String(version._id)
  await definition.save()

  console.log(`[seed] Leave flow definition created: ${LEAVE_FLOW_DEFINITION_NAME}`)
  return String(definition._id)
}

/**
 * Seed Phase 1 business FormSchemas (stub widgets) and publish them.
 * Also ensures leave approval flow definition exists from built-in template.
 */
export async function seedBusinessSchemas(): Promise<BusinessSeedResult> {
  const schemas: SeededBusinessSchema[] = []

  for (const spec of BUSINESS_SCHEMA_SEEDS) {
    const seeded = await upsertBusinessSchema(spec)
    if (seeded) schemas.push(seeded)
  }

  const leaveFlowDefinitionId = await seedLeaveFlowDefinition()
  await bindMenuSchemaIds()

  console.log(`[seed] Business schemas: ${schemas.length} ready`)
  return { schemas, leaveFlowDefinitionId }
}

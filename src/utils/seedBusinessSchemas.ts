import { v4 as uuidv4 } from 'uuid'
import { FormSchemaModel } from '../models/FormSchema.js'
import { PublishedSchemaModel } from '../models/PublishedSchema.js'
import { FlowVersionModel } from '../flow-models/FlowVersion.js'
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'
import { bindMenuSchemaIds } from './seedMenus.js'
import {
  BUSINESS_SCHEMA_SEEDS,
  DELIVERABLE_SCHEMA_CODES,
  type BusinessSchemaSeedSpec,
} from './businessSchemaStubs.js'
import {
  buildDeliverableSchemaJson,
  type BusinessSchemaRefs,
  isDeliverableSchemaCode,
} from './businessSchemaDeliverables.js'
import { seedBusinessFlowDefinitions } from './seedBusinessFlowDefinitions.js'
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
import { syncAllFlowFormBindings } from './seedFlowFormBinding.js'
import { resolveLeaveFlowGraphRoles } from './seedBusinessRoles.js'

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

async function syncLeaveFlowRoles(): Promise<void> {
  const definition = await FlowDefinitionModel.findOne({ tenantId: DEFAULT_TENANT_ID, name: LEAVE_FLOW_NAME })
  if (!definition?.currentVersionId) return
  const version = await FlowVersionModel.findById(definition.currentVersionId)
  if (!version?.graph) return
  const graph = version.graph as { nodes: Array<Record<string, unknown>> }
  if (await resolveLeaveFlowGraphRoles(graph)) {
    version.markModified('graph')
    await version.save()
    console.log('[seed] Leave flow definition roles synced')
  }
}

async function syncDeliverableSchemas(
  schemas: SeededBusinessSchema[],
  leaveFlowDefinitionId: string | null,
): Promise<number> {
  const refs: BusinessSchemaRefs = {
    schemas: {},
    leaveFlowDefinitionId,
  }
  for (const seeded of schemas) {
    refs.schemas[seeded.code] = {
      formSchemaId: seeded.formSchemaId,
      publishId: seeded.publishId,
    }
  }

  let updated = 0
  for (const code of DELIVERABLE_SCHEMA_CODES) {
    if (!isDeliverableSchemaCode(code)) continue
    const seeded = schemas.find((s) => s.code === code)
    if (!seeded) continue

    const json = buildDeliverableSchemaJson(code, refs)
    const draft = await FormSchemaModel.findById(seeded.formSchemaId)
    if (!draft) continue

    draft.json = json
    await draft.save()
    await publishFormSchema(draft)
    updated++
    console.log(`[seed] Deliverable schema synced: ${code}`)
  }

  return updated
}

/**
 * Seed Phase 1 business FormSchemas and publish them.
 * D1 deliverables (leave + workbench) always sync full Board JSON on each seed run.
 * Also ensures leave approval flow definition exists from built-in template.
 */
export async function seedBusinessSchemas(): Promise<BusinessSeedResult> {
  const schemas: SeededBusinessSchema[] = []

  for (const spec of BUSINESS_SCHEMA_SEEDS) {
    const seeded = await upsertBusinessSchema(spec)
    if (seeded) schemas.push(seeded)
  }

  const flowIds = await seedBusinessFlowDefinitions()
  await syncLeaveFlowRoles()
  const leaveFlowDefinitionId = flowIds[LEAVE_FLOW_NAME] ?? null

  const bindingMap: Array<{ flowName: string; schemaCode: string }> = [
    { flowName: LEAVE_FLOW_NAME, schemaCode: 'hr-leave-apply' },
    { flowName: TRIP_FLOW_NAME, schemaCode: 'oa-trip-apply' },
    { flowName: EXPENSE_FLOW_NAME, schemaCode: 'fin-expense-apply' },
    { flowName: PURCHASE_FLOW_NAME, schemaCode: 'fin-purchase-apply' },
    { flowName: OVERTIME_FLOW_NAME, schemaCode: 'hr-overtime-apply' },
    { flowName: ONBOARD_FLOW_NAME, schemaCode: 'hr-onboard-apply' },
    { flowName: RESIGN_FLOW_NAME, schemaCode: 'hr-resign-apply' },
    { flowName: SEAL_FLOW_NAME, schemaCode: 'oa-seal-apply' },
    { flowName: DOC_FLOW_NAME, schemaCode: 'oa-doc-receive' },
    { flowName: GOV_PARALLEL_FLOW_NAME, schemaCode: 'gov-case-apply' },
    { flowName: ASSET_FLOW_NAME, schemaCode: 'oa-asset-apply' },
    { flowName: RECRUIT_FLOW_NAME, schemaCode: 'hr-recruit-apply' },
    { flowName: RECRUIT_OFFER_FLOW_NAME, schemaCode: 'hr-recruit-offer' },
  ]
  await syncAllFlowFormBindings(
    bindingMap.flatMap(({ flowName, schemaCode }) => {
      const seeded = schemas.find((s) => s.code === schemaCode)
      if (!seeded) return []
      return [{ flowName, schemaCode, formSchemaId: seeded.formSchemaId, formPublishId: seeded.publishId }]
    }),
  )

  const synced = await syncDeliverableSchemas(schemas, leaveFlowDefinitionId)
  await bindMenuSchemaIds()

  console.log(`[seed] Business schemas: ${schemas.length} ready (${synced} deliverables synced)`)
  return { schemas, leaveFlowDefinitionId }
}

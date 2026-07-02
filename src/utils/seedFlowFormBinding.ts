/**
 * F-04 — Bind flow definition + UserTask nodes to form schema.
 */
import { FlowDefinitionModel } from '../flow-models/FlowDefinition.js'
import { FlowVersionModel } from '../flow-models/FlowVersion.js'
import { DEFAULT_TENANT_ID } from './initDefaultTenant.js'

export interface FormBinding {
  formSchemaId: string
  formPublishId: string
}

function bindFormToUserTaskNodes(
  graph: { nodes: Array<Record<string, unknown>> },
  binding: FormBinding,
): boolean {
  let changed = false
  for (const node of graph.nodes) {
    const data = node.data as Record<string, unknown> | undefined
    if (!data || data.bpmnType !== 'userTask') continue

    if (data.formSchemaId !== binding.formSchemaId) {
      data.formSchemaId = binding.formSchemaId
      changed = true
    }
    if (data.formPublishId !== binding.formPublishId) {
      data.formPublishId = binding.formPublishId
      changed = true
    }
    if (data.formMode !== 'view') {
      data.formMode = 'view'
      changed = true
    }
  }
  return changed
}

export async function syncFlowFormBinding(flowName: string, binding: FormBinding): Promise<boolean> {
  const definition = await FlowDefinitionModel.findOne({
    tenantId: DEFAULT_TENANT_ID,
    name: flowName,
  })
  if (!definition) return false

  let changed = false
  if (definition.formSchemaId !== binding.formSchemaId) {
    definition.formSchemaId = binding.formSchemaId
    changed = true
  }
  if (definition.formPublishId !== binding.formPublishId) {
    definition.formPublishId = binding.formPublishId
    changed = true
  }
  if (changed) await definition.save()

  if (!definition.currentVersionId) return changed

  const version = await FlowVersionModel.findById(definition.currentVersionId)
  if (!version?.graph) return changed

  const graph = version.graph as { nodes: Array<Record<string, unknown>> }
  const graphChanged = bindFormToUserTaskNodes(graph, binding)
  if (graphChanged) {
    version.markModified('graph')
    await version.save()
    console.log(`[seed] Flow "${flowName}" UserTask nodes bound to form schema`)
  }

  return changed || graphChanged
}

/** @deprecated use syncFlowFormBinding */
export async function syncLeaveFlowFormBinding(binding: FormBinding): Promise<boolean> {
  return syncFlowFormBinding('请假审批', binding)
}

export interface FlowFormBindingSpec {
  flowName: string
  schemaCode: string
  formSchemaId: string
  formPublishId: string
}

export async function syncAllFlowFormBindings(specs: FlowFormBindingSpec[]): Promise<void> {
  for (const spec of specs) {
    await syncFlowFormBinding(spec.flowName, {
      formSchemaId: spec.formSchemaId,
      formPublishId: spec.formPublishId,
    })
  }
}

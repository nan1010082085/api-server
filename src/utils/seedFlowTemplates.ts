import { FlowTemplateModel } from '../flow-models/FlowTemplate.js'
import { BUILTIN_FLOW_TEMPLATE_SPECS } from './builtinFlowGraphs.js'

/**
 * Ensure all built-in flow templates exist (idempotent).
 */
export async function seedBuiltinFlowTemplates(): Promise<void> {
  for (const spec of BUILTIN_FLOW_TEMPLATE_SPECS) {
    const existing = await FlowTemplateModel.findOne({ name: spec.name, isBuiltin: true })
    if (existing) {
      await FlowTemplateModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            graph: spec.graph,
            description: spec.description,
            category: spec.category,
            tags: spec.tags,
          },
        },
      )
      continue
    }

    await FlowTemplateModel.create({
      ...spec,
      isBuiltin: true,
      createdBy: 'system',
    })
    console.log(`[seed] Flow template created: ${spec.name}`)
  }
}

import { FlowTemplateModel } from '../flow-models/FlowTemplate.js'
import { BUILTIN_FLOW_TEMPLATE_SPECS } from './builtinFlowGraphs.js'

/**
 * Ensure all built-in flow templates exist (idempotent).
 * 使用 $setOnInsert：仅在记录不存在时写入，不覆盖用户对内置模板的自定义修改
 */
export async function seedBuiltinFlowTemplates(): Promise<void> {
  for (const spec of BUILTIN_FLOW_TEMPLATE_SPECS) {
    const result = await FlowTemplateModel.updateOne(
      { name: spec.name, isBuiltin: true },
      {
        $setOnInsert: {
          ...spec,
          isBuiltin: true,
          createdBy: 'system',
        },
      },
      { upsert: true },
    )
    if (result.upsertedCount > 0) {
      console.log(`[seed] Flow template created: ${spec.name}`)
    }
  }
}

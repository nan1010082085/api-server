import { describe, it, expect } from 'vitest'
import { APPLY_FLOW_BINDING_SPECS } from '../seedWebhooks.js'
import {
  ASSET_FLOW_NAME,
  DOC_FLOW_NAME,
  GOV_PARALLEL_FLOW_NAME,
  RECRUIT_FLOW_NAME,
  RECRUIT_OFFER_FLOW_NAME,
} from '../builtinFlowGraphs.js'

describe('seedWebhooks', () => {
  it('exports 16 submission flow bindings covering HR/OA/Finance/Gov', () => {
    expect(APPLY_FLOW_BINDING_SPECS.length).toBe(16)
    const schemaCodes = APPLY_FLOW_BINDING_SPECS.map((s) => s.schemaCode)
    expect(schemaCodes).toContain('hr-recruit-apply')
    expect(schemaCodes).toContain('hr-recruit-offer')
    expect(schemaCodes).toContain('oa-asset-apply')
    expect(schemaCodes).toContain('gov-case-accept')
    expect(schemaCodes).toContain('gov-license-apply')
  })

  it('uses named flow constants for L-27 flows', () => {
    const recruit = APPLY_FLOW_BINDING_SPECS.find((s) => s.schemaCode === 'hr-recruit-apply')
    expect(recruit?.flowName).toBe(RECRUIT_FLOW_NAME)
    const offer = APPLY_FLOW_BINDING_SPECS.find((s) => s.schemaCode === 'hr-recruit-offer')
    expect(offer?.flowName).toBe(RECRUIT_OFFER_FLOW_NAME)
    const asset = APPLY_FLOW_BINDING_SPECS.find((s) => s.schemaCode === 'oa-asset-apply')
    expect(asset?.flowName).toBe(ASSET_FLOW_NAME)
    const govAccept = APPLY_FLOW_BINDING_SPECS.find((s) => s.schemaCode === 'gov-case-accept')
    expect(govAccept?.flowName).toBe(GOV_PARALLEL_FLOW_NAME)
    const docDraft = APPLY_FLOW_BINDING_SPECS.find((s) => s.schemaCode === 'oa-doc-draft')
    expect(docDraft?.flowName).toBe(DOC_FLOW_NAME)
  })
})

import { describe, it, expect } from 'vitest'
import { buildSchemaViewPath, finalizeSchemaMenuPath, isLegacySchemaViewPath } from '../menuPath.js'

describe('menuPath', () => {
  it('builds unique schema view paths', () => {
    expect(buildSchemaViewPath('hr-leave-apply')).toBe('/app/editor/view/hr-leave-apply')
  })

  it('finalizes legacy seed path from schemaCode', () => {
    expect(finalizeSchemaMenuPath('/app/editor/view', 'oa-trip-apply')).toBe(
      '/app/editor/view/oa-trip-apply',
    )
    expect(finalizeSchemaMenuPath('/dashboard', 'dashboard-workbench')).toBe('/dashboard')
  })

  it('detects legacy shared path', () => {
    expect(isLegacySchemaViewPath('/app/editor/view')).toBe(true)
    expect(isLegacySchemaViewPath('/app/editor/view/hr-leave-apply')).toBe(false)
  })
})

/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { FLOW_ROLE_CODE_MAP } from '../seedBusinessRoles.js'

describe('FLOW_ROLE_CODE_MAP', () => {
  it('maps leave flow template codes to business role names', () => {
    expect(FLOW_ROLE_CODE_MAP.department_manager).toBe('部门经理')
    expect(FLOW_ROLE_CODE_MAP.hr).toBe('HR')
  })
})

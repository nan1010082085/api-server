export interface BusinessSchemaRefs {
  schemas: Record<string, { formSchemaId: string; publishId: string }>
  leaveFlowDefinitionId: string | null
}

export interface BusinessSchemaSeedSpec {
  code: string
  name: string
  type: 'form' | 'search_list' | 'layout' | 'table' | 'chart' | 'business' | 'report' | 'other'
  json: Record<string, unknown>
}

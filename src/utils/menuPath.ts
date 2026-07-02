/** Schema 菜单唯一路由：/app/editor/view/{schemaCode} */
export const SCHEMA_VIEW_PREFIX = '/app/editor/view/'

export function buildSchemaViewPath(schemaCode: string): string {
  return `${SCHEMA_VIEW_PREFIX}${schemaCode}`
}

export function isLegacySchemaViewPath(path: string): boolean {
  return path === '/app/editor/view' || path === '/app/editor/view/'
}

export function finalizeSchemaMenuPath(path: string, schemaCode?: string): string {
  if (!schemaCode) return path
  if (path && !isLegacySchemaViewPath(path)) return path
  return buildSchemaViewPath(schemaCode)
}

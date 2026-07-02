export interface MenuSeed {
  parentId: string | null
  name: string
  path: string
  icon: string
  type: 'menu' | 'button'
  permission: string
  sort: number
  microAppId: string | null
  target?: '_self' | '_blank'
  routeType?: 'schema' | 'micro-app' | 'link'
  schemaId?: string | null
  schemaCode?: string
  url?: string
  app?: string
  layout?: 'with-menu' | 'without-menu'
}

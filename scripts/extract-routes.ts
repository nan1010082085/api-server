#!/usr/bin/env tsx

/**
 * 路由提取脚本
 *
 * 从路由文件中提取 HTTP 方法、路径和中间件信息
 * 用于辅助生成和更新 OpenAPI 文档
 *
 * 使用方式: pnpm openapi:extract
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface RouteInfo {
  method: string
  path: string
  middleware: string[]
  file: string
  line: number
}

interface RouterInfo {
  prefix: string
  file: string
  routes: RouteInfo[]
}

// 路由文件目录
const ROUTES_DIR = join(__dirname, '../src/routes')
const FLOW_ROUTES_DIR = join(__dirname, '../src/flow-routes')
const AI_ROUTES_DIR = join(__dirname, '../src/ai')

/**
 * 从文件内容中提取路由信息
 */
function extractRoutes(content: string, filePath: string): { prefix: string; routes: RouteInfo[] } {
  const lines = content.split('\n')
  let prefix = ''
  const routes: RouteInfo[] = []

  // 提取 router prefix
  const prefixMatch = content.match(/new Router\(\s*\{\s*prefix:\s*['"]([^'"]+)['"]\s*\}\s*\)/)
  if (prefixMatch) {
    prefix = prefixMatch[1]
  }

  // 根据文件名推断 prefix（如果没有显式定义）
  if (!prefix) {
    const fileName = basename(filePath, '.ts')
    if (fileName === 'health') {
      prefix = '/api/health'
    } else if (fileName === 'docs') {
      prefix = '/api/docs'
    }
  }

  // 提取路由定义
  const routeRegex = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g
  let match

  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase()
    const path = match[2]
    const lineNumber = content.substring(0, match.index).split('\n').length

    // 提取中间件（简单匹配）
    const middleware: string[] = []
    const middlewareRegex = /(?:requireAuth|requirePermission|requireFlowDesign|requireFlowView|requireFlowLaunch|requireAdmin|validate|authMiddleware)\([^)]*\)/g
    const lineContent = lines[lineNumber - 1] || ''
    const fullContext = content.substring(
      Math.max(0, match.index - 200),
      match.index + match[0].length + 200
    )

    let mwMatch
    while ((mwMatch = middlewareRegex.exec(fullContext)) !== null) {
      middleware.push(mwMatch[0])
    }

    routes.push({
      method,
      path: prefix + path,
      middleware: [...new Set(middleware)],
      file: basename(filePath),
      line: lineNumber,
    })
  }

  return { prefix, routes }
}

/**
 * 扫描目录中的路由文件
 */
function scanRouteFiles(dir: string): RouterInfo[] {
  const routers: RouterInfo[] = []

  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))

    for (const file of files) {
      const filePath = join(dir, file)
      const content = readFileSync(filePath, 'utf-8')
      const { prefix, routes } = extractRoutes(content, filePath)

      if (routes.length > 0) {
        routers.push({
          prefix,
          file: basename(filePath),
          routes,
        })
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }

  return routers
}

/**
 * 按模块分组路由
 */
function groupRoutesByModule(routers: RouterInfo[]): Record<string, RouterInfo[]> {
  const modules: Record<string, RouterInfo[]> = {
    'system': [],
    'form-designer': [],
    'flow-engine': [],
    'ai-capabilities': [],
    'platform-extensions': [],
  }

  for (const router of routers) {
    const prefix = router.prefix

    // 系统管理
    if (
      prefix.startsWith('/api/auth') ||
      prefix.startsWith('/api/users') ||
      prefix.startsWith('/api/roles') ||
      prefix.startsWith('/api/depts') ||
      prefix.startsWith('/api/menus') ||
      prefix.startsWith('/api/posts') ||
      prefix.startsWith('/api/tenants') ||
      prefix.startsWith('/api/config') ||
      prefix.startsWith('/api/audit') ||
      prefix.startsWith('/api/login') ||
      prefix.startsWith('/api/online') ||
      prefix.startsWith('/api/micro-apps') ||
      prefix.startsWith('/api/notices') ||
      prefix.startsWith('/api/business') ||
      prefix.startsWith('/api/metrology') ||
      prefix === '/api/health' ||
      prefix === '/api/docs'
    ) {
      modules['system'].push(router)
    }
    // 表单设计器
    else if (
      prefix.startsWith('/api/schemas') ||
      prefix.startsWith('/api/templates') ||
      prefix.startsWith('/api/dict') ||
      prefix.startsWith('/api/options') ||
      prefix.startsWith('/api/submissions') ||
      prefix.startsWith('/api/mock') ||
      prefix.startsWith('/api/data')
    ) {
      modules['form-designer'].push(router)
    }
    // 流程引擎
    else if (
      prefix.startsWith('/api/flows') ||
      prefix.startsWith('/api/flow-') ||
      prefix.startsWith('/api/flow/') ||
      prefix === '/api/flow'
    ) {
      modules['flow-engine'].push(router)
    }
    // AI 能力
    else if (
      prefix.startsWith('/api/ai') ||
      prefix.startsWith('/api/providers') ||
      prefix.startsWith('/api/models')
    ) {
      modules['ai-capabilities'].push(router)
    }
    // 平台扩展
    else if (
      prefix.startsWith('/api/keys') ||
      prefix.startsWith('/api/key-usage') ||
      prefix.startsWith('/api/credentials') ||
      prefix.startsWith('/api/model-configs') ||
      prefix.startsWith('/api/webhooks') ||
      prefix.startsWith('/api/stats') ||
      prefix.startsWith('/api/dashboard') ||
      prefix.startsWith('/api/mcp')
    ) {
      modules['platform-extensions'].push(router)
    }
    // 未分类
    else {
      console.warn(`Uncategorized route: ${prefix}`)
    }
  }

  return modules
}

/**
 * 生成统计报告
 */
function generateReport(modules: Record<string, RouterInfo[]>): void {
  console.log('\n=== Schema Platform API 路由统计 ===\n')

  let totalRoutes = 0

  for (const [module, routers] of Object.entries(modules)) {
    const routeCount = routers.reduce((sum, r) => sum + r.routes.length, 0)
    totalRoutes += routeCount

    console.log(`📦 ${module}`)
    console.log(`   文件数: ${routers.length}`)
    console.log(`   端点数: ${routeCount}`)

    if (routers.length > 0) {
      console.log('   路由前缀:')
      for (const router of routers) {
        console.log(`     - ${router.prefix} (${router.routes.length} 端点)`)
      }
    }
    console.log('')
  }

  console.log(`📊 总计: ${totalRoutes} 个端点\n`)
}

/**
 * 导出为 JSON 文件
 */
function exportToJson(modules: Record<string, RouterInfo[]>): void {
  const outputPath = join(__dirname, '../openapi/routes-report.json')

  const report = {
    generatedAt: new Date().toISOString(),
    modules: Object.entries(modules).map(([name, routers]) => ({
      name,
      routerCount: routers.length,
      routeCount: routers.reduce((sum, r) => sum + r.routes.length, 0),
      routers: routers.map(r => ({
        prefix: r.prefix,
        file: r.file,
        routes: r.routes,
      })),
    })),
    totalRoutes: Object.values(modules).flat().reduce((sum, r) => sum + r.routes.length, 0),
  }

  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`✅ 路由报告已导出到: ${outputPath}`)
}

// 主程序
console.log('🔍 正在扫描路由文件...\n')

const allRouters: RouterInfo[] = [
  ...scanRouteFiles(ROUTES_DIR),
  ...scanRouteFiles(FLOW_ROUTES_DIR),
  ...scanRouteFiles(AI_ROUTES_DIR),
]

console.log(`📁 扫描完成，发现 ${allRouters.length} 个路由文件\n`)

const modules = groupRoutesByModule(allRouters)
generateReport(modules)
exportToJson(modules)

/**
 * Tool 配置校验脚本
 *
 * 校验所有工具配置文件中的 label 和 category 是否必填。
 * 运行方式：pnpm validate:tools
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

interface ToolConfig {
  name: string
  kind: string
  label?: string
  category?: string
  argsHint?: string
  description?: string
}

interface ToolFile {
  tools: ToolConfig[]
}

const TOOLS_DIR = join(import.meta.dirname, '../config/plugins/tools')

function validateTools(): void {
  console.log('=== Tool 配置校验 ===\n')

  const files = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.json'))
  let hasError = false

  for (const file of files) {
    const filePath = join(TOOLS_DIR, file)
    const content = readFileSync(filePath, 'utf-8')
    const config: ToolFile = JSON.parse(content)

    if (!config.tools || !Array.isArray(config.tools)) {
      console.error(`❌ ${file}: 缺少 tools 数组`)
      hasError = true
      continue
    }

    for (const tool of config.tools) {
      const errors: string[] = []

      if (!tool.name?.trim()) {
        errors.push('name 必填')
      }
      if (!tool.kind?.trim()) {
        errors.push('kind 必填')
      }
      if (!tool.label?.trim()) {
        errors.push('label 必填')
      }
      if (!tool.category?.trim()) {
        errors.push('category 必填')
      }

      if (errors.length > 0) {
        console.error(`❌ ${file} > ${tool.name || '(unnamed)'}: ${errors.join(', ')}`)
        hasError = true
      }
    }
  }

  if (!hasError) {
    console.log('✅ 所有工具配置校验通过')
  } else {
    console.log('\n❌ 存在校验错误，请修复后重试')
    process.exit(1)
  }
}

validateTools()

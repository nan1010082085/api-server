/**
 * Industry MCP Server — 通过 MCP 协议暴露行业专属工具。
 *
 * 提供行业模板搜索和行业表单校验，供 AI Agent 和外部 MCP 客户端共用。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  searchIndustryTemplates,
  getIndustryConfig,
  type IndustryType,
} from '../config/industryAgents.js'

// 行业校验规则（与 industryTools.ts 保持一致，作为权威定义源）
const INDUSTRY_VALIDATION_RULES: Record<IndustryType, Array<{ field: string; rule: string; message: string }>> = {
  medical: [
    { field: 'patientName', rule: 'required', message: '患者姓名为必填项' },
    { field: 'idCard', rule: 'sensitive', message: '身份证号应标记为敏感字段' },
    { field: 'diagnosis', rule: 'required', message: '诊断为必填项' },
    { field: 'chiefComplaint', rule: 'required', message: '主诉为必填项' },
  ],
  finance: [
    { field: 'loanAmount', rule: 'precision', message: '金额字段应保留2位小数' },
    { field: 'idCard', rule: 'sensitive', message: '身份证号应标记为敏感字段' },
    { field: 'phone', rule: 'sensitive', message: '手机号应标记为敏感字段' },
    { field: 'interestRate', rule: 'display', message: '利率应展示为年化利率' },
  ],
  education: [
    { field: 'studentName', rule: 'required', message: '学生姓名为必填项' },
    { field: 'studentNo', rule: 'required', message: '学号为必填项' },
    { field: 'idCard', rule: 'sensitive', message: '身份证号应标记为敏感字段' },
  ],
}

export function createIndustryServer(): McpServer {
  const server = new McpServer({
    name: 'industry',
    version: '2.0.0',
  })

  server.tool(
    'industry__search_templates',
    `搜索行业专属模板。当用户要求生成特定行业的表单或流程时，先搜索相关模板作为参考。

参数：keyword — 搜索关键词（如"病历"、"贷款"）；industry — 指定行业（medical/finance/education）；type — 按类型筛选（form/flow）。
返回 JSON 包含 templates 数组，每项含 id、name、description、type、industry。`,
    {
      keyword: z.string().describe('搜索关键词，如"病历"、"贷款"、"请假"'),
      industry: z.enum(['medical', 'finance', 'education']).optional().describe('指定行业，不传则搜索所有行业'),
      type: z.enum(['form', 'flow']).optional().describe('按类型筛选：form=表单，flow=流程'),
    },
    async ({ keyword, industry, type }) => {
      const results = searchIndustryTemplates(keyword, industry as IndustryType | undefined)
      const filtered = type ? results.filter((r) => r.type === type) : results

      const summary = filtered.length === 0
        ? `没有找到${industry ? `${getIndustryConfig(industry as IndustryType)?.name ?? industry}的` : ''}相关模板`
        : `找到 ${filtered.length} 个行业模板：${filtered.slice(0, 3).map((t) => `${t.name}（${t.type === 'form' ? '表单' : '流程'}）`).join('、')}${filtered.length > 3 ? '等' : ''}`

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: {
              total: filtered.length,
              templates: filtered.map((t) => ({
                id: t.id, name: t.name, description: t.description, type: t.type, industry: t.industry,
              })),
            },
            summary,
          }),
        }],
      }
    },
  )

  server.tool(
    'industry__validate_form',
    `根据行业规范校验表单 Schema。检查必填字段（如患者姓名、学号）和敏感字段标记。在生成行业表单后调用此工具检查是否符合行业要求。

参数：widgets — 要校验的 Widget 数组；industry — 行业类型（medical/finance/education）。
返回 JSON 包含 warnings 建议列表和 componentCount 组件数量。`,
    {
      widgets: z.array(z.record(z.unknown())).describe('要校验的 Widget 数组'),
      industry: z.enum(['medical', 'finance', 'education']).describe('行业类型'),
    },
    async ({ widgets, industry }) => {
      const config = getIndustryConfig(industry as IndustryType)
      if (!config) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: `未知行业类型: ${industry}` }),
          }],
        }
      }

      const rules = INDUSTRY_VALIDATION_RULES[industry as IndustryType] ?? []
      const warnings: Array<{ field: string; message: string }> = []

      const fields = new Set<string>()
      function collectFields(nodes: Record<string, unknown>[]): void {
        for (const node of nodes) {
          const props = node.props as Record<string, unknown> | undefined
          if (props?.field) fields.add(props.field as string)
          if (Array.isArray(node.children)) collectFields(node.children as Record<string, unknown>[])
        }
      }
      collectFields(widgets as Record<string, unknown>[])

      for (const rule of rules) {
        if (rule.rule === 'required' && !fields.has(rule.field)) {
          warnings.push({ field: rule.field, message: rule.message })
        }
      }

      const summary = warnings.length === 0
        ? `${config.name}表单校验通过，共 ${(widgets as unknown[]).length} 个组件`
        : `${config.name}表单校验发现 ${warnings.length} 个建议：${warnings.map((w) => w.message).join('；')}`

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            data: { industry, valid: true, warnings, componentCount: (widgets as unknown[]).length },
            summary,
          }),
        }],
      }
    },
  )

  return server
}

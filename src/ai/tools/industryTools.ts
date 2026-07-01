/**
 * 行业工具 — LangGraph StructuredTool 已迁入 MCP Server。
 *
 * industry__search_templates、industry__validate_form 通过 registry 获取。
 * 此文件保留行业配置查询函数，供内部模块使用。
 */

import {
  searchIndustryTemplates,
  getIndustryTemplates,
  getIndustryConfig,
  type IndustryType,
  type IndustryTemplate,
} from '../config/industryAgents.js'

// 行业工具已全部迁入 MCP，无 LangGraph 专有工具
export const industryOnlyTools: never[] = []

// Re-export 配置查询函数（内部模块仍可使用）
export {
  searchIndustryTemplates,
  getIndustryTemplates,
  getIndustryConfig,
  type IndustryType,
  type IndustryTemplate,
}

/**
 * allTools — 向后兼容入口。
 *
 * 读取/校验类工具已迁入 MCP Server，通过 tools/registry.ts 统一管理。
 * 此文件保留为兼容入口，转发到 registry。
 *
 * @deprecated 直接使用 tools/registry.ts 的 getAllToolsSync()
 */

import { getAllToolsSync } from './registry.js'

export const allTools = getAllToolsSync()

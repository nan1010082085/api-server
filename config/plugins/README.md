# 插件中心配置目录

> **完整文档**（架构、运行时、待办）：[`ai/docs/plugin.md`](../../../ai/docs/plugin.md)

按类型分目录存放，**每个 MCP / Expert / Skill 一个 JSON 文件**；工具按域分组（`tools/mcp-schema.json` 等）。

```
plugins/
├── mcp/              # 单文件 = 一个 McpServerDeclaration（含 id）
├── tools/            # 单文件 = { "tools": [...] } 或裸数组
├── experts/          # 单文件 = 一个 ExpertDeclaration（含 id）
├── skills/           # 单文件 = 一个 SkillDeclaration（含 id）；content 或 file 字段
├── packs/            # 可分发插件包源码（manifest.json + 各 layer）
├── local/            # 本机覆盖（建议 gitignore），结构与上相同
├── tenants/{id}/     # 租户 overlay（配合 AI_PLUGIN_TENANT_ID）
└── local.example/    # 扩展示例，复制到 local/ 后改 enabled
```

## 加载顺序（后者覆盖同 id / name）

1. `config/plugins/{mcp,tools,experts,skills}/`
2. `config/plugins/local/`（本机覆盖，建议 gitignore）
3. `config/plugins/tenants/{AI_PLUGIN_TENANT_ID}/`（专租户部署时）
4. **请求内租户**（多租户 SaaS）：`getPluginRegistry()` 自动读取 `tenantStorage`，合并 `plugins/tenants/{tenantId}/`（LRU 缓存 32 份）
5. `AI_PLUGIN_CONFIG_PATH` 环境变量（文件或同结构目录）

修改 `plugins/local/` 后开发态可 **SIGHUP 热重载** 或自动监听（`AI_PLUGIN_WATCH=1`）；生产默认需 `kill -HUP` 或重启。

## 插件包 pack / install

```bash
# 打包
pnpm plugin:pack --dir config/plugins/packs/example.support --out dist/example.support.tgz

# 安装到 local 或租户目录
pnpm plugin:install --file dist/example.support.tgz
pnpm plugin:install --file dist/example.support.tgz --tenant acme

# 校验
pnpm plugin:validate
```

包结构：`manifest.json`（id / name / version）+ `mcp|tools|experts|skills/` JSON 文件。

## 新增插件

| 类型 | 操作 |
|------|------|
| MCP | 在 `mcp/` 新增 `{id}.json`，transport 选 inmemory / stdio / sse；inmemory 自定义用 `factoryModule` |
| Tool | 在对应 `tools/mcp-*.json` 或 `langgraph.json` 追加条目 |
| Skill | 在 `skills/` 新增 `{id}.json`，或 `file` 指向 Markdown |
| Expert | 在 `experts/` 新增 `{id}.json`，引用 tools / skills；`legacyAgentKey` 仅作 task chain 调度键，非图节点（见 [plugin.md](../../../ai/docs/plugin.md#legacyagentkey-说明)） |

设计器 Palette 与 `GET /api/ai/plugins` 自动感知新条目。

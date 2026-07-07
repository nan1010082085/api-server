# 插件中心（Server）

> 服务端视角的索引页。详细说明见 AI 文档独立章节。

| 主题 | 文档 |
|------|------|
| 架构、生产清单、CLI、待办与实现思路 | [`ai/docs/plugin.md`](../../ai/docs/plugin.md) |
| 未完成任务进度 | [`ai/docs/product/backlog.md`](../../ai/docs/product/backlog.md) |
| 本目录配置说明 | [`config/plugins/README.md`](../config/plugins/README.md) |

**API**：`GET /api/ai/plugins` — 返回 `{ experts, skills, tools, mcpServers }` 快照（见 [api-reference.md](./api-reference.md)）。

**CLI**（在 `server/` 目录）：

```bash
pnpm plugin:validate
pnpm plugin:pack --dir config/plugins/packs/example.support --out dist/example.support.tgz
pnpm plugin:install --file dist/example.support.tgz [--tenant acme]
kill -HUP $(pgrep -f "dist/index.js")
```

# 业务平台运维指南

## 部署与 Seed

```bash
cd schema-form-server
pnpm install
pnpm db:seed    # 同步 80+ 业务 Schema、菜单、字典、Flow、Agent 模板
pnpm dev        # API :3000
```

默认账号：`admin` / `admin123456`（租户 `000000`）

演示租户：`demo`（seed 后可通过租户切换验证，ID `100001`）

## 模块验收清单

| Wave | 验收项 | 命令/路径 |
|------|--------|-----------|
| 0 | 请假详情 Timeline + TaskActions | `/app/editor/view?id=<hr-leave-detail publishId>&recordId=` |
| 0 | Flow embed 审批 | `/app/flow/embed/task/:taskId` |
| 1 | 扩展 Schema 数量 | `DELIVERABLE_SCHEMA_CODES.length >= 80` |
| 2 | 公告 API S-05 | `GET /api/notices?status=published` |
| 2 | OA/财务菜单 | Shell 侧栏 OA办公、财务管理 |
| 3 | 每日摘要 A-06 | `GET /api/ai/runtime/daily-digest` |
| 3 | GlobalSearch SH-02 | Shell 顶栏搜索菜单 / 路径 / Schema |
| 4 | E2E | `E2E_ENABLED=1 pnpm test:e2e`（需 shell+server 运行中） |

## 备份

- MongoDB：`mongodump --uri="$MONGODB_URI" --out=./backup/$(date +%F)`
- 恢复：`mongorestore --uri="$MONGODB_URI" ./backup/<date>`

## 公共包变更

修改 `@schema-platform/platform-shared` / `@schema-platform/flow-shared` / `@schema-platform/ai-shared` 后：

1. workspace 链接本地验证
2. bump 版本 + `pnpm publish`
3. 各子项目 `pnpm update @schema-platform/<pkg>`

## 故障排查

- Schema 页面空白：检查菜单 `schemaId` 是否 bind（`bindMenuSchemaIds`）
- 流程未启动：检查 `SubmissionFlowBinding` 与 Flow 定义是否 published
- 审批 Widget 无数据：确认 URL 含 `flowInstanceId` / `taskId`

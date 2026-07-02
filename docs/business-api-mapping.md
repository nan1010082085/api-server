# 业务平台 API 映射

> Server 接口与 `schema-form-shell/docs/business-platform/modules/` 模块文档对齐说明。  
> 基础 CRUD 复用现有 `/api/*`；模块聚合走 `/api/business/*`。

## 1. 路由分层

| 层级 | 前缀 | 用途 |
|------|------|------|
| 平台基础 | `/api/users`, `/api/roles`, `/api/depts`, `/api/menus`, `/api/dict` | 系统管理、字典 |
| 表单运行时 | `/api/submissions/:schemaId` | 所有 Schema 表单提交与台账 |
| 流程 | `/api/flow-*`, `/api/flow/tasks` | 审批待办、实例 |
| 工作台 | `/api/dashboard` | 工作台 KPI（S-07） |
| **业务模块** | `/api/business/{module}/...` | 模块聚合、详情视图、统计 |

## 2. Phase 1 模块 ↔ 接口

### 工作台（modules/00-workbench）

| Schema | 接口 | 说明 |
|--------|------|------|
| `dashboard-workbench` | `GET /api/dashboard` | statistic `apiUrl: /dashboard`，路径 `kpis.*` / `flows.*` |

### 人事 — 请假（modules/03-hr-personnel）

| Schema | 接口 | 说明 |
|--------|------|------|
| `hr-leave-apply` | `POST /api/submissions/:formSchemaId` body `{ data }` | submitSubmission 动作 |
| | `submission.created` → Webhook 绑定 | 自动启动「请假审批」流程，回写 `flowInstanceId` |
| `hr-leave-list` | `GET /api/submissions/:formSchemaId` | 默认 `enrich=true`，含 `submitterName`、`currentTaskName` |
| `hr-leave-detail` | `GET /api/business/hr/leave/detail?recordId=` | descriptions `dataSource` URL 含 `{{variables.recordId}}`；PublishView `?recordId=` 注入变量 |
| | `GET /api/submissions/:schemaId/:id/view` | 同上扁平视图，按 schemaId + id |
| `hr-leave-stats` | `GET /api/business/hr/leave/stats` | `monthlyCount`、`avgDays`、`byDept`、`monthlyTrend` |
| `oa-trip-list` / 弹窗 | `GET /api/submissions/{oa-trip-apply schemaId}` | AdvancedTable + export |
| `oa-trip-detail` | `GET /api/business/oa/trip/detail?recordId=` | descriptions + 全屏审批 |
| 字典 | `GET /api/dict/data/by-type/leave_type` | seed `leave_type`（`seedBusinessDicts`） |

### 系统管理（modules/01-system-admin）

| Schema | 接口 | Widget |
|--------|------|--------|
| `sys-user-mgmt` | `GET/POST/PUT/DELETE /api/users` | UserManagement |
| `sys-role-mgmt` | `GET/POST/PUT/DELETE /api/roles` | RoleManagement |
| `sys-dept-mgmt` | `GET/POST/PUT/DELETE /api/depts` | TreeLayout + Form |

### 能力平台运营（modules/06）

| 菜单 | 接口 |
|------|------|
| Schema 管理 | `/api/schemas`, `/api/published-schemas` |
| 流程 | Flow 子路由 |
| Agent/RAG | `/api/ai/*` |

## 3. Submission 增强（S-13）

列表/详情默认 enrichment 字段：

| 字段 | 来源 |
|------|------|
| `submitterName` | User.displayName |
| `deptName` | User.deptId → Dept.name |
| `flowStatus` / `flowStatusLabel` | FlowInstance.status |
| `currentTaskName` | 待办 TaskInstance.nodeName |

流程结束/驳回时 `flowSubmissionStatusBridge` 同步 `submission.status`。

## 4. Seed 与启动

```bash
pnpm db:seed   # 含 seedBusinessDicts、业务 Schema、菜单绑定、Webhook
pnpm dev       # 启动时 runBusinessSeeds() 幂等同步 deliverable JSON
```

## 5. 后续模块（Phase 2+）

| 模块 | 规划接口 ID | 说明 |
|------|-------------|------|
| OA 公告 | S-05 | `/api/business/oa/announcements` |
| 通知中心 | S-04 | `/api/business/notifications` |
| 审计 | S-09 | `/api/business/audit/*` |
| 报表 | S-11 | `/api/business/reports/aggregate` |
| 财务 | S-12 | `/api/business/finance/*` |

新增模块时：在 `src/routes/businessModule.ts` 或 `src/routes/business/` 下扩展，并更新本文档与 shell `02-capability-gap` 矩阵。

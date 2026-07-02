# Submission → Flow Webhook 配置（S-03）

Phase 1 使用 **SubmissionFlowBinding** 模型实现「表单提交自动启动流程」，配置形状与业务文档一致。

## 配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 绑定名称 |
| `event` | `'submission.created'` | 固定事件 |
| `schemaId` | string | 表单 Schema 的 MongoDB `_id`（`POST /api/submissions/:schemaId` 中的 id） |
| `flowDefinitionId` | string | 已发布流程定义 ID |
| `enabled` | boolean | 是否启用 |
| `fieldMapping` | `Record<string, string>` | 表单字段 → 流程变量，如 `{ "days": "days", "leaveType": "leaveType" }` |

## 示例：请假申请启动流程

```json
{
  "name": "请假申请启动流程",
  "event": "submission.created",
  "schemaId": "{hr-leave-apply-form-schema-id}",
  "flowDefinitionId": "{leave-flow-definition-id}",
  "enabled": true,
  "fieldMapping": {
    "days": "days",
    "leaveType": "leaveType"
  }
}
```

## 运行时行为

1. `POST /api/submissions/:schemaId` 成功后 `eventBus` 发出 `submission.created`
2. `submissionFlowBridge` 查找匹配的 `SubmissionFlowBinding`
3. 按 `fieldMapping` 映射变量，调用 `FlowEngine.startFlow`
4. 回写 `FormSubmission.flowInstanceId`

## Seed

`pnpm db:seed` 或服务启动时 `runBusinessSeeds()` 会：

- 确保 `hr-leave-apply` Schema 与「请假审批」流程定义存在
- upsert 名为「请假申请启动流程」的 binding

## 与 HTTP Webhook 的区别

| 机制 | 用途 |
|------|------|
| `SubmissionFlowBinding` | 平台内表单 → 流程（S-03） |
| `Webhook` + `webhookDispatcher` | 对外 HTTP 通知（HMAC 签名） |
| `POST /api/webhooks/:id/trigger` | 外部系统 → 流程 |

外部 Webhook 仍订阅 `submission.created` 等事件；内部流程启动走 Binding，避免 localhost 回环。

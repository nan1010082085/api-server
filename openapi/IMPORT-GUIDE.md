# Apifox 导入指南

## 概述

本文档说明如何将 Schema Platform 的 OpenAPI 3.0 文档导入 Apifox。

## 文件结构

```
openapi/
├── index.yaml                    # 主入口（包含所有模块引用）
├── system.yaml                   # 系统管理模块（68 个端点）
├── form-designer.yaml            # 表单设计器模块（44 个端点）
├── flow-engine.yaml              # 流程引擎模块（53 个端点）
├── ai-capabilities.yaml          # AI 能力模块（70 个端点）
├── platform-extensions.yaml      # 平台扩展模块（35 个端点）
└── components/
    ├── schemas.yaml              # 公共 Schema 定义
    ├── parameters.yaml           # 公共参数
    └── security.yaml             # 认证方案
```

## 导入方式

### 方式一：导入单个模块（推荐）

适合按项目/模块分别管理 API 文档：

1. 打开 Apifox
2. 选择或创建一个项目
3. 点击左侧「项目设置」→「导入数据」
4. 选择「OpenAPI/Swagger」格式
5. 选择对应的 YAML 文件：
   - `system.yaml` - 系统管理
   - `form-designer.yaml` - 表单设计器
   - `flow-engine.yaml` - 流程引擎
   - `ai-capabilities.yaml` - AI 能力
   - `platform-extensions.yaml` - 平台扩展
6. 点击「导入」

### 方式二：导入所有模块

适合一次性导入所有 API：

1. 打开 Apifox
2. 选择或创建一个项目
3. 点击左侧「项目设置」→「导入数据」
4. 选择「OpenAPI/Swagger」格式
5. 选择 `index.yaml` 文件
6. 点击「导入」

> **注意**：由于 `index.yaml` 使用了 `$ref` 引用其他文件，Apifox 可能需要将所有文件放在同一目录下才能正确解析。

### 方式三：通过 URL 导入

如果将 OpenAPI 文件部署到服务器：

1. 将 YAML 文件上传到可访问的 URL
2. 在 Apifox 中选择「通过 URL 导入」
3. 输入文件 URL
4. 点击「导入」

## 环境配置

### 创建环境

1. 在 Apifox 中点击左侧「环境管理」
2. 创建新环境，例如「开发环境」
3. 添加环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `baseUrl` | `http://localhost:3001` | API 基础路径 |
| `token` | （登录后获取） | JWT Token |
| `apiKey` | （创建后获取） | API Key |

### 配置认证

#### JWT Token 认证

1. 在 Apifox 中选择「项目设置」→「全局参数」
2. 添加 Header 参数：
   - 名称：`Authorization`
   - 值：`Bearer {{token}}`
   - 勾选「启用」

或者在每个请求的「认证」标签页中设置：
- 类型：Bearer Token
- Token：`{{token}}`

#### API Key 认证

1. 在 Apifox 中选择「项目设置」→「全局参数」
2. 添加 Header 参数：
   - 名称：`X-API-Key`
   - 值：`{{apiKey}}`
   - 勾选「启用」

### 自动获取 Token

可以配置登录接口自动获取 Token：

1. 在 Apifox 中选择「项目设置」→「自动操作」
2. 添加「前置操作」：
   - 条件：当 `{{token}}` 为空时
   - 操作：发送 `POST /api/auth/login` 请求
   - 后置脚本：
     ```javascript
     const response = pm.response.json();
     if (response.success) {
       pm.environment.set("token", response.data.token);
     }
     ```

## 使用建议

### 1. 按模块组织

建议在 Apifox 中创建文件夹，按模块组织 API：

```
├── 系统管理
│   ├── 认证
│   ├── 用户管理
│   ├── 角色管理
│   └── ...
├── 表单设计器
│   ├── Schema 管理
│   ├── 模板管理
│   └── ...
├── 流程引擎
│   ├── 流程定义
│   ├── 流程实例
│   └── ...
├── AI 能力
│   ├── 对话管理
│   ├── RAG 知识库
│   └── ...
└── 平台扩展
    ├── API Key
    ├── Webhook
    └── ...
```

### 2. 使用示例数据

OpenAPI 文件中已包含示例数据，导入后可以直接使用：

- 请求参数示例
- 响应数据示例
- 错误响应示例

### 3. 生成 Mock 数据

Apifox 可以根据 OpenAPI 定义自动生成 Mock 数据：

1. 选择 API 端点
2. 点击「Mock 设置」
3. 选择「自动 Mock」或「手动配置」

### 4. 导出为其他格式

Apifox 支持导出为多种格式：

- Postman Collection
- HAR
- cURL
- Code（多种编程语言）

## 更新文档

### 手动更新

当 API 变更时：

1. 更新对应的 YAML 文件
2. 在 Apifox 中重新导入
3. 选择「覆盖」或「合并」模式

### 自动同步

可以通过 CI/CD 自动同步：

```yaml
# .github/workflows/sync-api-docs.yml
name: Sync API Docs

on:
  push:
    paths:
      - 'openapi/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Sync to Apifox
        run: |
          # 使用 Apifox CLI 或 API 同步
          # 具体命令参考 Apifox 文档
```

## 常见问题

### Q: 导入后端点数量不对？

A: 检查 YAML 文件语法是否正确。可以使用在线工具验证：
- https://editor.swagger.io/
- https://apitools.dev/swagger-parser/online/

### Q: 如何处理 `$ref` 引用？

A: Apifox 支持解析 `$ref` 引用。如果遇到问题，可以：
1. 使用 `swagger-cli` 将所有引用合并为单个文件
2. 或者分别导入每个模块文件

### Q: 如何测试 WebSocket 接口？

A: OpenAPI 3.0 不支持 WebSocket 定义。对于 Socket.IO 接口（如 AI 对话、Workflow 进度），需要：
1. 在 Apifox 中手动创建 WebSocket 请求
2. 或使用其他工具（如 Postman）测试

### Q: 如何处理文件上传接口？

A: OpenAPI 文件中已定义 `multipart/form-data` 格式。在 Apifox 中：
1. 选择请求体格式为「form-data」
2. 添加文件类型的参数
3. 选择要上传的文件

## 相关链接

- [Apifox 官方文档](https://apifox.com/help/)
- [OpenAPI 3.0 规范](https://spec.openapis.org/oas/v3.0.3)
- [Schema Platform API 文档](../docs/api-reference.md)

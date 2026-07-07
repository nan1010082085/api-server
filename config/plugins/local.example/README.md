# 本地插件覆盖

将 `local.example/` 复制为 `local/` 后修改：

```bash
cp -R config/plugins/local.example config/plugins/local
```

或在仓库根 `server/config/plugins/` 下手动创建 `local/{mcp,tools,experts,skills}/`。

`local/` 建议加入 `.gitignore`。也可继续使用单文件 `config/ai-plugins.local.json`。

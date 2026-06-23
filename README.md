# Agents Desktop

基于 Electron + TypeScript 的 AI Agent 桌面应用，源自 `feature-agent-core`（Python FastAPI + Vue 3）的全栈 TypeScript 化改造。

## 核心特性

- **声明式 Agent**：Agent 不再是"代码模块"，而是 `{id, systemPrompt, tools[], model, stream}` 描述符
- **统一入口**：`/command/{agentId}` 单一命令路由，可在设置中配置
- **免登录**：默认 `default` profile 匿名本地存档；多 profile 切换
- **桌面端 MCP**：MCP 服务器配置（新增/编辑/开关/删除）可在应用内可视化操作，热加载
- **本地优先**：数据落 `<userData>/profiles/{profileId}/` 本地 SQLite + 文件系统

## 开发

```bash
# Node 版本
nvm use   # 读 .nvmrc

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 测试
pnpm test         # 单元 + 集成
pnpm test:e2e     # E2E (Playwright + Electron)
```

## 文档

- 设计 spec：[`docs/superpowers/specs/2026-06-23-feature-agent-desktop-typescript-design.md`](../feature-agent-core/docs/superpowers/specs/2026-06-23-feature-agent-desktop-typescript-design.md)
- 实施计划：[`docs/superpowers/plans/2026-06-23-feature-agent-desktop-typescript.md`](../feature-agent-core/docs/superpowers/plans/2026-06-23-feature-agent-desktop-typescript.md)
- 项目记忆：[`project_memory.md`](./project_memory.md)

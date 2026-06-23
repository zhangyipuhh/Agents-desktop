# 项目记忆文档

## 项目概述

**Agents Desktop** —— 基于 Electron + TypeScript 全栈的 AI Agent 桌面应用。源自 `E:\laboratory\AI\Agents\feature-agent-core`（Python FastAPI + Vue 3）的全栈 TS 化改造。

**核心创新**：Agent 不再是"代码模块"，而是**声明式 descriptor**（`{id, systemPrompt, tools[], model, stream}`），由 `/command/{agentId}` 单一入口 + 桌面端设置页配置。

## 技术栈

- **运行时**: Node.js 20+（`.nvmrc` 锁定 20.19.2）
- **包管理**: pnpm（**禁止混用 npm**；lockfile `pnpm-lock.yaml`）
- **语言**: TypeScript 5.x（strict 模式，多 tsconfig：`tsconfig.json` / `tsconfig.electron.json`）
- **桌面端**: Electron 32+
- **AI/LLM**: `@langchain/core` / `@langchain/langgraph` 1.x、`@langchain/openai` / `@langchain/anthropic` / `@langchain/deepseek` / `@langchain/google-genai` / `@langchain/ollama`、`@langchain/mcp-adapters` 0.2.x、`@modelcontextprotocol/sdk`
- **测试**: Vitest（单测+集成）、Playwright（E2E）、`@vue/test-utils`
- **存储**: better-sqlite3 + LangGraph SQLite Checkpoint
- **前端**: Vue 3 + Vite + Pinia + Vue Router + Element Plus
- **代码规范**: ESLint + Prettier
- **打包**: electron-builder

## 目录结构约定

```
Agents-desktop/
├── electron/                  # Electron 主进程入口（旧 spec 用法；后迁移到 src/main/）
├── src/
│   ├── main/                  # 主进程业务代码
│   ├── preload/               # preload 桥接（contextBridge 暴露 API）
│   ├── renderer/              # Vue 3 渲染层
│   ├── shared/                # 跨进程共享类型
│   └── __tests__/             # 跨进程共享类型测试（如有）
├── resources/                 # 静态资源（图标、默认配置等）
├── out/                       # 打包输出
├── dist/                      # Vite 渲染层构建产物
├── dist-electron/             # 主进程 tsc 编译产物
├── .nvmrc                     # Node 版本锁定
├── tsconfig.json              # 渲染层 + 共享
├── tsconfig.electron.json     # 主进程 + preload
├── vitest.config.ts
├── playwright.config.ts
├── electron-builder.yml
└── project_memory.md          # 本文件
```

### 测试目录映射（**重要**：与原 `feature-agent-core` 习惯不同）

```
src/main/foo/bar.ts            →  src/main/__tests__/foo/bar.test.ts
src/main/foo/bar/baz.ts        →  src/main/__tests__/foo/bar/baz.test.ts
src/preload/foo.ts             →  src/preload/__tests__/foo.test.ts
src/renderer/components/X.tsx  →  src/renderer/__tests__/components/X.test.tsx
src/shared/types.ts            →  src/shared/__tests__/types.test.ts
```

- 测试目录**无需 `__init__.py`**（TypeScript 走 `tsconfig` / `vitest.config.ts` 推断）
- 测试文件命名：`{源文件名}.test.ts`（**首字母大小写与源文件保持一致**）
- 测试用例结构：`describe('{被测对象}')` + `it('{场景}_{预期结果}', ...)`
- **Mock 规范**：`vi.mock('electron', ...)` 在 `vitest.setup.ts` 统一注入，**禁止在多个测试文件里重复 mock**

## 核心架构决策（已与用户对齐）

| 决策项 | 选择 | 影响 |
|--------|------|------|
| 运行形态 | Electron 主进程承载全部 core 能力 | app/core 的 LLM/Agent/MCP/文件/并发队列全部在 Node 20+ TS 进程跑；不再有 FastAPI |
| 改造范围 | 全栈 TS 化（含 features + shared） | PostgreSQL → better-sqlite3；JWT/Captcha/User 管理删除 |
| Agent 形态 | 声明式 descriptor（id + systemPrompt + tools[] + model + stream + middleware[]） | 9 个 feature Agent 不再是"独立模块"，改为"工具/Prompt 资产包" |
| 入口 | `/command/{agentId}` 单一入口，可在设置中配置 | 替代 `/api/contract/chat`、`/api/map/chat` 等多路由 |
| 配置存储 | `userData/mcp-config.json`（Zod schema 校验） | 旧 `app/shared/tools/mcp/config.yaml` 兼容，首次启动可导入 |
| 认证 | 免登录 + 匿名本地存档 + 多 Profile（默认 `default`） | 适配多用户共用一台设备场景 |
| **并发队列** | **不需要** | **桌面端每个用户独占本机资源，无共享后端；直接删除 `app/core/concurrency/` 整层** |
| 数据目录 | `<userData>/profiles/{profileId}/{upload,sessions,Knowledge,...}/` | 与本仓 `data/` 解耦 |
| 测试 | Vitest（单测+集成）+ Playwright（E2E） | 从原 47 个 pytest 用例 1:1 翻译起步 |
| 流程 | 严格 TDD（RED → GREEN → REFACTOR） | 用户硬性要求 |

## 注释规范

**所有代码注释必须使用中文**，包括：
- 函数 / 方法 / 类的 JSDoc（参数、返回值、异常）
- 复杂逻辑的内联注释
- IPC handler（`ipcMain.handle`）必须在 JSDoc 中标注 `channel` 名
- preload 通过 `contextBridge.exposeInMainWorld` 暴露的 API 必须标注 channel 名 + 参数类型 + Promise resolve/reject 形态
- 渲染进程事件回调（`ipcRenderer.on`）必须标注 channel 名

## project_memory.md 同步协议

每次 `Edit`/`Write` 工具调用后必须评估是否需要同步本文件。触发清单：
- 新增/删除/重命名 `src/main`、`src/preload`、`src/renderer`、`src/shared` 下的模块或子目录
- 修改 `src/shared/types.ts` 等共享类型契约
- 改动 IPC channel 名或签名
- 改动 `BrowserWindow` 配置或 `webPreferences`
- 改动前端组件、UI 架构、设计 token
- 改动 `tsconfig.json`、ESLint/Prettier 配置
- 改动 `electron-builder.yml`、环境变量、CI 配置
- 改动 Vitest 配置或测试覆盖率阈值
- 其他架构层面变化

回复结尾必须输出 checklist：`[✓ project_memory.md 已同步]` 或 `[✗ 本次修改无 project_memory.md 同步需要：<理由>]`

## 测试同步协议

每次 `Edit`/`Write` 修改 `src/main/**`、`src/preload/**`、`src/renderer/**`、`src/shared/**` 下任何 `.ts/.tsx` 文件后必须评估是否需要同步测试。触发清单：
- 新增函数、方法、类、interface、type、enum 导出
- 新增 IPC handler（`ipcMain.handle` / `ipcMain.on`）
- 新增 `contextBridge.exposeInMainWorld` 暴露的方法
- 新增 `if/else` 分支、throw / reject 抛出点
- 新增 CRUD 函数或持久化方法
- 新增配置文件项且伴随读取/使用逻辑
- 新增 IPC channel 字符串常量
- 新增 `BrowserWindow` 实例化点或 `webPreferences` 配置

最终回复必须包含：`[✓ 测试已同步生成并通过]` 或 `[✗ 本次修改无测试同步需要：<理由>]`

## 设计/计划文档

- 设计 spec：[../feature-agent-core/docs/superpowers/specs/2026-06-23-feature-agent-desktop-typescript-design.md](../feature-agent-core/docs/superpowers/specs/2026-06-23-feature-agent-desktop-typescript-design.md)（934 行）
- 实施计划：[../feature-agent-core/docs/superpowers/plans/2026-06-23-feature-agent-desktop-typescript.md](../feature-agent-core/docs/superpowers/plans/2026-06-23-feature-agent-desktop-typescript.md)（~2000 行）

## 关联源工程

- **源工程**：`E:\laboratory\AI\Agents\feature-agent-core`（Python FastAPI + Vue 3）
- **源工程 plan_memory**：[../feature-agent-core/project_memory.md](../feature-agent-core/project_memory.md)（2051+ 行，记录原 Python 工程的全部模块、数据结构、API、并发队列、Skills 系统等）
- **迁移策略**：从原 `app/tests/core/*` 47 个 pytest 用例 1:1 翻译起步；新结构按本工程 `__tests__/` 约定组织

## Phase 0 实施记录（2026-06-23 完成）

### 已交付的脚手架

| Task | 状态 | 提交 | 关键产物 |
|------|------|------|----------|
| 0.1 目录骨架 + pnpm init | ✅ | 1da5320 | `package.json`、`.gitignore`、`.nvmrc` (Node 20.19.2)、`README.md` |
| 0.2 TypeScript 配置 | ✅ | b708695 | `tsconfig.json`（renderer/shared）、`tsconfig.electron.json`（main/preload）；strict 模式 + 多路径别名 |
| 0.3 Vitest + Playwright | ✅ | c61fb8e | `vitest.config.ts`、`playwright.config.ts`、`tests/unit/sanity.test.ts`（2 用例通过） |
| 0.4 Electron 主进程骨架 | ✅ | 212ab7f | `src/main/main.ts`、`src/preload/preload.ts`、`src/renderer/{App.vue,main.ts,index.html}`、`vite.config.ts`、`src/main/__tests__/main.test.ts`（3 用例通过） |
| 0.5 ESLint + Prettier | ✅ | 56ad3ea / a216153 | `eslint.config.js`（flat config）、`.prettierrc`、`.prettierignore` |
| 0.6 E2E smoke | ✅ | 1c72eb8 | `tests/e2e/smoke.test.ts`（**注**：electron 二进制需联网下载，CI 环境需先 `pnpm rebuild electron`） |
| 0.7 目录结构最终化 | ✅ | 7372278 | `src/main/{core,mcp,agents,services,storage}/` + 子目录、`.gitkeep` 占位 |
| 收尾验证 | ✅ | d18f836 | `vitest.config.ts` 排除 `tests/e2e/`；全量 `typecheck` + `test` (5/5) + `lint` 0 errors 通过 |

### 关键工程参数

- **Node**: 20.19.2（`.nvmrc` 锁定）
- **TypeScript**: 5.9.3（strict 全开：`noImplicitAny` / `strictNullChecks` / `noUnusedLocals` / `noUnusedParameters` / `exactOptionalPropertyTypes`）
- **pnpm**: 10.34.4
- **Electron**: 32.3.3（webPreferences: `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true` / preload 桥接）
- **Vue**: 3.5.38 + vue-router 4.6.4 + pinia 3.0.4
- **Vite**: 6.4.3（与 `@vitejs/plugin-vue@5.x` 配套；v8 不兼容）
- **测试栈**: vitest 4.1.9 + @vitest/coverage-v8 4.1.9 + @playwright/test 1.61.0
- **代码规范**: ESLint 10.5.0（flat config）+ Prettier 3.8.4
- **测试 Mock**: `src/main/__tests__/setup.ts` 统一注入 electron mock（避免重复 mock）

### 路径别名

| 别名 | 指向 | 用于 |
|------|------|------|
| `@main/*` | `src/main/*` | 主进程代码（主进程测试亦可） |
| `@preload/*` | `src/preload/*` | preload 桥接 |
| `@renderer/*` | `src/renderer/*` | 渲染层 |
| `@shared/*` | `src/shared/*` | 跨进程共享类型 |

### 验证命令

```bash
pnpm typecheck    # tsc --noEmit（renderer + electron 双 tsconfig）
pnpm test         # vitest run（5/5 通过）
pnpm lint         # eslint . --ext .ts,.vue（0 errors）
pnpm test:e2e     # playwright test（需先 pnpm rebuild electron 安装二进制）
```

### Phase 1 准备

- 主进程核心模块目录 `src/main/core/{agent,command,concurrency,config,format,llmcalls,messages,router,skills,tools}/` 已就位
- 翻译源：`E:\laboratory\AI\Agents\feature-agent-core\app\core/*`（40 个 Python 文件）+ `app/tests/core/*`（47 个 pytest 用例作为参考）
- 翻译顺序：config → messages → concurrency → skills → llmcalls → tools → agent → router

## Phase 1 实施记录（2026-06-23 部分完成 - 本会话已暂停）

### 已交付

| Task | 状态 | 提交 | 关键产物 | 测试数 |
|------|------|------|----------|--------|
| 1.1 共享类型 + Zod | ✅ | (phase 0 commit) | `src/shared/types/{common,message,llm,window.d.ts}.ts` + index 聚合 | 8 |
| 1.2 SettingsService | ✅ | af9c25d / 59e4cd7 | `src/main/core/config/SettingsService.ts`（Pydantic → Zod，含 Sandbox/Skills 嵌套） | 11 |
| 1.3 AgentConcurrencyQueue | ❌ **已删除** | 3afd40a | 桌面端每个 Electron 实例 = 一个用户独占本机资源，不需要共享后端队列 | — |
| 1.4 Skills 系统 | ✅ | 78813be | `src/main/core/skills/service.ts`（合并 schemas/discovery/registry/load_skill/白名单） | 18 |

**测试总数**：37 + 5 (Phase 0) = **42 通过 / 0 lint / 0 typecheck**

### 关键决策（已与用户对齐）

1. **桌面端不需要并发队列**（2026-06-23 用户明确）：
   - 原 Python `app/core/concurrency/agent_concurrency_queue.py` 整层删除
   - `ConcurrencyQueue` 不出现在工程中
   - 影响：CommandRouter 不推送 `type:'queue'` chunk；前端 `streamParser` 仍保留字段兼容但运行时不触发

2. **js-yaml v5 ESM 注意点**：
   - v5 不再提供 default export，必须用 `import { load as yamlLoad } from 'js-yaml'`
   - `import yaml from 'js-yaml'` 在 ESM 模式下 `yaml` 是 `undefined`

3. **缓存 key 设计**：
   - `SkillsService` 单例 cache key 必须包含 `projectRoot`（不同工程根互不影响）
   - 避免测试间相互污染

### 剩余 Phase 1

| Task | 状态 | 备注 |
|------|------|------|
| 1.5 LLMCatalog | ⏳ 下个会话 | 5 家模型工厂（openai/anthropic/deepseek/google/ollama） |
| 1.6 Messages + Stream Format | ⏳ 下个会话 | converter + trim + stream/{base,context,default,ollama} |
| 1.7 Tools | ⏳ 下个会话 | BaseFilesystemTool / SandboxTool / HITL / MCP adapter |
| 1.8 Router | ⏳ 下个会话 | file upload/download → IPC handler |
| 1.9 AgentDescriptor + RuntimeContext | ⏳ 下个会话 | spec §3.1 核心创新前置 |
| P1 收尾 | ⏳ 下个会话 | 全量 typecheck + test + lint |

### 下次会话快速恢复指引

1. **目标工程**：`E:\laboratory\AI\Agents-desktop`（已 git init，16 个 commit）
2. **环境**：`conda activate "E:\laboratory\AI\Agents"` + `pnpm`（10.34.4）
3. **当前状态**：`pnpm test` → 42/42 通过；`pnpm typecheck` 0 errors；`pnpm lint` 0 errors
4. **下一步起点**：Task 1.5 LLMCatalog（参考实施 plan `P1.T1.5` 章节）
5. **参考文档**：
   - 设计 spec：`E:\laboratory\AI\Agents\feature-agent-core\docs\superpowers\specs\2026-06-23-feature-agent-desktop-typescript-design.md`
   - 实施 plan：`E:\laboratory\AI\Agents\feature-agent-core\docs\superpowers\plans\2026-06-23-feature-agent-desktop-typescript.md`
   - 本工程 project_memory：本文件

### Phase 0 + Phase 1 已完成 commit 索引

```
1da5320  chore: init project scaffold
b708695  chore(tsconfig): strict mode
c61fb8e  chore(test): vitest + playwright
212ab7f  feat(electron): main+preload+renderer
56ad3ea  chore(lint): eslint flat config
1c72eb8  test(e2e): smoke
7372278  chore: directory skeleton
d18f836  chore(phase-0): exclude e2e
a0706b6  docs(memory): record Phase 0
3afd40a  chore: remove AgentConcurrencyQueue
af9c25d  feat(config): SettingsService
59e4cd7  fix(config): remove NodeJS, fix any
78813be  feat(skills): unified service
```

### 验证命令

```bash
cd "E:\laboratory\AI\Agents-desktop"
pnpm test         # 42/42 通过
pnpm typecheck    # 0 errors
pnpm lint         # 0 errors
pnpm dev          # 启动 Vite 渲染层 (http://localhost:5173)
pnpm dev:electron # 启动 Electron 桌面端 (需先 pnpm rebuild electron)
```

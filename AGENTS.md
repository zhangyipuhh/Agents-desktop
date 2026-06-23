
Use as many skills and agents as possible to implement features

All code should follow clean code principles and maintain existing functionality

Comments need to be added after file generation. The comments should be in Chinese and need to include information about function parameters, return values, exceptions, etc. **对于 Electron 项目，除常规函数/类/方法外，IPC handler（`ipcMain.handle`）、preload 通过 `contextBridge.exposeInMainWorld` 暴露的 API、渲染进程事件回调（`ipcRenderer.on`）也必须在 JSDoc 中标注 `channel` 名、参数类型、返回 Promise 的 resolve/reject 形态。**

## CSS Debugging Principles

1. **Prioritize Anomalous Data** — When any computed/live value clearly violates expectations (e.g., a button is 1528px inside a 60px container), immediately stop the current direction and explain this contradiction first.
2. **Don't Just Check Dimensions, Check Position** — `getBoundingClientRect()` is better than `offsetWidth` for discovering "element exists but is moved out of viewport" issues. Always output width + x/y together.
3. **`overflow: hidden` + Centering = Common Hidden Root Cause** — `justify-content: center` pushes narrow icons to the center of wide containers, and `overflow: hidden` clips them. Prioritize checking this combination when investigating invisible elements. **在 Electron 渲染进程里，`BrowserWindow` 自身的 `webPreferences`（`frame`、`titleBarStyle`、`transparent`）与窗口尺寸/位置属性也可能让渲染层被裁剪或移出视口，定位时必须同步检查。**
4. **Trace the `width: 100%` Reference Chain** — `100%` is relative to the containing block, not the parent flex container. Check whether every ancestor in the chain has width constraints.
5. **Chase One Hypothesis at Most 3 Steps** — If the phenomenon remains unchanged after 3 modifications, change direction. If multiple consecutive modifications to the same property are ineffective, the root cause is not in that property.

## ⚠️ HARD RULE：project_memory.md 同步协议

**READ 阶段**：在执行任何 `Edit`/`Write` 工具之前，必须先调用 `Read('project_memory.md')` 读取项目记忆。
**适用范围**：`src/main/**`、`src/preload/**`、`src/renderer/**`、`src/shared/**` 下的 `.ts/.tsx` 文件，以及 `tsconfig*.json`、`electron-builder.yml`、`electron-forge.config.*`、`package.json`、`.env*`、`vitest.config.ts` 等配置文件。

**WRITE 阶段**：每次 `Edit`/`Write` 工具调用后，必须评估"这次修改是否影响 `project_memory.md` 中的某个章节"：

- 是 → 立即调用 `Edit('project_memory.md', ...)` 同步
- 否 → 在回复结尾明确说明"无同步需要"

**触发清单**（以下任一情况都触发同步）：

- 新增 / 删除 / 重命名 `src/main`、`src/preload`、`src/renderer`、`src/shared` 下的模块或子目录
- 修改 `src/shared/types.ts` 等共享类型契约（主进程与渲染进程共用的 `interface` / `type` / `enum`）
- 改动 IPC `channel` 名、`ipcMain.handle` / `ipcMain.on` 签名、`contextBridge.exposeInMainWorld` 暴露面（相当于 API 路由变更）
- 改动 `BrowserWindow` 配置、`webPreferences`（`contextIsolation` / `nodeIntegration` / `sandbox` / `preload` 路径等）
- 改动前端组件、UI 架构、设计 token（CSS 变量、主题、布局系统）
- 改动 `tsconfig.json`（`strict`、`paths`、`baseUrl`、`target`、`module` 等）、ESLint/Prettier 配置
- 改动 `electron-builder.yml` / `electron-forge` 打包配置、环境变量 `.env*`、Docker/CI 配置
- 改动 Vitest 配置、新增/删除/调整测试文件或测试覆盖率阈值
- 其他架构层面变化：认证体系、Session/缓存策略、IPC 重试与超时策略、安全模型等

**强制约束**：

- **禁止使用 `Glob` 探测 `project_memory.md`**（本环境 Glob 工具索引不完整，对根目录文件返回 0 命中，会让 AI 误判文件不存在）
- 必须用 `Read` 工具直接读取
- 项目记忆同步必须在主任务回复中完成，**禁止在主任务之外另开新对话处理**
- 回复结尾必须输出 checklist：`[✓ project_memory.md 已同步]` 或 `[✗ 本次修改无 project_memory.md 同步需要：<理由>]`

# Project Memory

- Read project key information through project_memory.md before modification, including project architecture, functional modules, IPC contracts, shared types, build/packaging configuration, etc.
- When modifying code, make changes based on the information in project_memory.md to ensure modifications do not affect the normal operation of the project.
- After modifying code, update the information in project_memory.md to ensure it remains consistent with the actual project status.
- After modifying code, test the project functionality to ensure modifications do not affect the normal operation of the project. **Electron 项目的"测试"环节还应包括 `npm run build`（主进程 TypeScript 编译 + 渲染进程 webpack/vite 打包）必须无错误；纯渲染进程改动还应跑 `npm run lint` 与相关 Vitest 用例。**

---

## 🔧 工具环境说明：Glob 工具索引不完整

**重要**：本环境（Trae sandbox）中的 `Glob` 工具对以下目标**返回 0 命中**，但 `Get-ChildItem`（PowerShell 真实枚举）能正常看到：

| 目标                                                                                        | 状态        |
| ------------------------------------------------------------------------------------------- | ----------- |

**强制约束**：

- 文件操作优先使用 `Write`/`Edit`，禁止用 `echo`/`cat`/`sed` 等 shell 命令
- 搜索文件优先使用 `Glob`/`Grep`，禁止用 `find`/`grep` 等 shell 命令
- 读取文件优先使用 `Read`，禁止用 `cat`/`head`/`tail` 等 shell 命令
- **包管理**：本项目 Electron + TypeScript 依赖优先用 `pnpm`（速度快、磁盘省），其次 `npm`；**禁止在同一项目内混用 pnpm 与 npm**（lockfile 冲突会导致 CI 与本地行为不一致）。新增依赖统一用 `pnpm add <pkg>` / `pnpm add -D <pkg>`，**禁止用 `echo` / `cat` / 文本编辑器直接改写 `package.json`**，必须走包管理器 CLI。
- **Node 版本**：通过 `.nvmrc` 锁定；CI、本地、容器必须保持一致；改动 Node 版本需同步更新 `.nvmrc` 与 `project_memory.md`。

## ⚠️ HARD RULE：测试同步协议

**READ 阶段**：在执行 `Edit`/`Write` 修改 `src/main/**`、`src/preload/**`、`src/renderer/**`、`src/shared/**` 下任何 `.ts/.tsx` 文件之前，应先了解对应模块是否已有测试文件及其测试风格（describe/it 用法、是否 mock `electron`、是否使用 `electron-mock-ipc` 等）。

**WRITE 阶段**：每次 `Edit`/`Write` 工具调用修改上述范围内的文件后，必须评估"本次修改是否引入了需要测试的新功能"：

- 是 → 立即在对应 `__tests__/` 目录生成或更新测试文件
- 否 → 在任务回复结尾明确说明 `[✗ 本次修改无测试同步需要：<理由>]`

**触发清单**（以下任一情况都视为引入新功能，需要同步测试）：

- 新增/导出函数、方法、类，或新增 `interface` / `type` / `enum` 导出
- 新增 IPC handler（`ipcMain.handle` / `ipcMain.on`）或 preload 通过 `contextBridge` 暴露给渲染进程的 API（相当于新增"路由端点"）
- 新增 `contextBridge.exposeInMainWorld('<namespace>', { ... })` 中的方法（渲染进程可见 API 变更）
- 新增 `if/else` 业务分支、新的 `throw` / Promise `reject` 抛出点
- 新增文件 / 数据库 / 配置的 CRUD 函数或持久化方法
- 新增 `tsconfig` / `electron-builder` / `.env*` 配置项且伴随读取/使用逻辑
- **新增 IPC channel 字符串常量**（必须保证 channel 命名唯一且有对应 handler 测试，避免渲染进程 `invoke` 了一个无人接收的 channel）
- **新增 `BrowserWindow` 实例化点或 `webPreferences` 配置**（安全相关，必须有针对 `contextIsolation` / `nodeIntegration` 的断言）

**不触发清单**（以下情况无需追加测试）：

- 仅修改注释、文档字符串（TSDoc/JSDoc）、日志文本
- 仅重命名变量、函数、文件（无行为变化）
- 仅调整代码格式、换行、空格、import 排序
- 纯 bug 修复且未改变原有接口契约（仍应验证现有测试通过；IPC handler 行为变化时该条不适用）
- 仅修复 `webPreferences` 字段名拼写错误并保持行为不变（无新配置项、无新分支），但仍应跑 `npm run build` 与现有 Vitest 用例验证

**测试文件路径映射**：

```
src/main/foo/bar.ts            →  src/main/__tests__/foo/bar.test.ts
src/main/foo/bar/baz.ts        →  src/main/__tests__/foo/bar/baz.test.ts
src/preload/foo.ts             →  src/preload/__tests__/foo.test.ts
src/renderer/components/X.tsx  →  src/renderer/__tests__/components/X.test.tsx
src/shared/types.ts            →  src/shared/__tests__/types.test.ts
```

- 测试目录无需 `__init__.py`（TypeScript 靠 `tsconfig` / `vitest.config.ts` 推断）
- 测试文件命名：`{源文件名}.test.ts`（或 `.test.tsx`），**首字母大小写与源文件保持一致**（不像 Python 要小写转换）
- 测试用例结构：`describe('{被测对象}')` + `it('{场景}_{预期结果}', ...)`；IPC handler 用例建议使用 `electron-mock-ipc` 或 `vi.mock('electron', ...)` 隔离
- **Mock 规范**：测试中需要用到 `BrowserWindow` / `ipcMain` / `app` 等 Electron API 时，统一在 `vitest.setup.ts` 中通过 `vi.mock('electron', ...)` 注入；禁止在多个测试文件里重复 mock 实现

**最低测试内容要求**：

| 优先级 | 测试类型 | 说明 |
|-------|---------|------|
| P0 | 导入/存在性 | `test_{对象}_importable` / `test_{对象}_exists` |
| P1 | 成功路径 | 正常输入下功能按预期工作；IPC 正常响应 |
| P1 | 失败路径 | 异常输入下抛出预期异常 / `reject` / 返回预期错误码 |
| P1 | **IPC 契约** | `expect(ipcMain.handle).toHaveBeenCalledWith('domain:action', expect.any(Function))` 验证 channel 注册正确 |
| P2 | 边界条件 | 空值、`undefined`、`null`、超长字符串（channel 名长度限制）、大数等 |


**强制约束**：

- 测试同步必须在主任务回复中完成，**禁止在主任务之外另开新对话处理**
- 生成测试后必须执行以下命令之一验证通过：
  ```bash
  npx vitest run <对应路径> --reporter=verbose
  ```
  或
  ```bash
  npm test -- <对应路径>
  ```
- 若测试失败，需修复源码或测试直至通过
- 涉及 Electron 自身 API（如 `BrowserWindow` 创建、文件对话框）时，单元测试应使用 `vi.mock` 隔离；端到端验证使用 Playwright/Spectron 等独立流程，**不要在单元测试中真实启动 Electron**
- 最终回复必须包含 checklist：`[✓ 测试已同步生成并通过]` 或 `[✗ 本次修改无测试同步需要：<理由>]`

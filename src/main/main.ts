/**
 * Electron 主进程入口
 *
 * 负责：
 * - 应用生命周期管理（app.whenReady / window-all-closed）
 * - BrowserWindow 实例化（严格使用 `contextIsolation: true` + `nodeIntegration: false` + preload 桥接）
 * - 注册 IPC handler（业务代码逐步迁移到 `src/main/core/`、`src/main/services/`）
 * - 加载 Vite 开发服务器（开发模式）或 dist 静态文件（生产模式）
 *
 * 安全模型：
 * - 渲染进程与 Node 完全隔离（contextIsolation）
 * - 所有跨进程能力通过 preload 暴露的 `electronAPI` 走 IPC
 * - `nodeIntegration: false` 禁止渲染进程直接访问 Node API
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 主窗口单例引用（关闭窗口时置空） */
let mainWindow: BrowserWindow | null = null;

/**
 * 创建主窗口
 *
 * 加载内容：
 * - 开发模式：连接 Vite 开发服务器（默认 `http://localhost:5173`）
 * - 生产模式：加载 Vite 打包产物 `dist/index.html`
 *
 * webPreferences 安全配置：
 * - `contextIsolation: true`：渲染进程与 preload 隔离（必须）
 * - `nodeIntegration: false`：禁止渲染进程 require Node 模块（必须）
 * - `sandbox: true`：开启 Chromium 沙箱（推荐）
 * - `preload`：唯一允许的 Node 能力入口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 窗口准备就绪后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const devServer = process.env['VITE_DEV_SERVER_URL'];
  if (devServer) {
    mainWindow.loadURL(devServer);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 外部链接走系统默认浏览器，不在 Electron 内打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 注册 IPC handler
 *
 * 业务 IPC handler 后续会按域拆分到 `src/main/services/*` 并通过 `registerIpcHandlers()` 统一注册。
 * 当前仅注册 ping 占位 handler 用于 Phase 0 smoke 验证。
 */
function registerIpcHandlers(): void {
  /**
   * IPC channel: `ping`
   *
   * @returns 'pong' 字符串，用于渲染层验证 IPC 链路通畅
   * @throws 不会抛出错误
   */
  ipcMain.handle('ping', (): string => {
    return 'pong';
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // macOS 平台：dock 图标点击 + 无窗口时重新创建
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 非 macOS 平台：所有窗口关闭后退出应用
  if (process.platform !== 'darwin') app.quit();
});

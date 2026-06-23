/**
 * Preload 桥接
 *
 * 通过 `contextBridge.exposeInMainWorld` 把受限的 IPC 能力暴露给渲染进程。
 * 渲染进程只能通过 `window.electronAPI` 访问白名单内的方法，不能直接访问 Node API。
 *
 * 安全原则：
 * - 暴露面越小越好（每个方法都需明确 channel 名 + 参数类型 + Promise 形态）
 * - 不暴露 ipcRenderer 自身
 * - 不暴露 fs / child_process / shell 等 Node 能力给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * 暴露给渲染进程的 API 契约
 *
 * 后续每个域（command / mcp / agents / session / file / profile / settings）都会在此追加方法。
 * 每个方法的 JSDoc 必须标注：
 * 1. 调用的 IPC channel 名（必须与主进程 `ipcMain.handle` 配对）
 * 2. 参数类型
 * 3. 返回 Promise 的 resolve 类型 / 可能 reject 的错误形态
 */
const api = {
  /**
   * IPC channel: `ping`
   *
   * @returns Promise<string> resolve 为 'pong'；不会 reject
   */
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
};

/**
 * 类型导出（供 `src/renderer/env.d.ts` 或 `src/shared/types/window.d.ts` 引用）
 */
export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);

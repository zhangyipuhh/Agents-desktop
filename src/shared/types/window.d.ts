/**
 * 共享类型：window 全局声明
 *
 * 让 TypeScript 知道 `window.electronAPI` 来自 preload 暴露，
 * 渲染进程代码可以直接 `window.electronAPI.xxx()` 而无需 import。
 *
 * 类型来源：`src/preload/preload.ts` 中的 `export type ElectronAPI = typeof api`
 */

import type { ElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

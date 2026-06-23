/**
 * Vitest 全局 setup
 *
 * 统一注入 Electron mock（避免在每个测试文件里重复 mock）。
 * 主进程测试 IPC handler 时通过 `import { ipcMain } from 'electron'` 拿到 mock 后的对象。
 */

import { vi } from 'vitest';

class MockBrowserWindow {
  on = vi.fn();
  once = vi.fn();
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  webContents = { openDevTools: vi.fn(), setWindowOpenHandler: vi.fn() };
}

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn((name: string) => `/tmp/electron-test/${name}`),
  },
  BrowserWindow: MockBrowserWindow,
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(() => '/mocked/dir/main.ts'),
}));

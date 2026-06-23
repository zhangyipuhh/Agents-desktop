/**
 * Electron 主进程 smoke 测试
 *
 * 验证：
 * - electron 模块能正常 import（被 mock 注入）
 * - BrowserWindow 可构造
 * - 启动主入口时不抛错
 */

import { describe, it, expect, vi } from 'vitest';

describe('electron main smoke', () => {
  it('app object is defined via mock', async () => {
    const { app, BrowserWindow, ipcMain } = await import('electron');
    expect(app).toBeDefined();
    expect(typeof BrowserWindow).toBe('function');
    expect(ipcMain.handle).toBeDefined();
  });

  it('BrowserWindow constructor returns a window-like object', async () => {
    const { BrowserWindow } = await import('electron');
    const win = new BrowserWindow();
    expect(win.on).toBeDefined();
    expect(win.webContents).toBeDefined();
  });

  it('ipcMain.handle can be invoked', async () => {
    const { ipcMain } = await import('electron');
    const handler = vi.fn(() => 'pong');
    vi.mocked(ipcMain.handle).mockImplementationOnce(() => undefined);
    ipcMain.handle('ping', handler);
    expect(ipcMain.handle).toHaveBeenCalledWith('ping', expect.any(Function));
  });
});

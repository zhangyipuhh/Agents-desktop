/**
 * fileDownloadRouter（文件下载 IPC handlers）单元测试
 *
 * 1:1 翻译自 `app/core/router/file_download_router.py`（Phase 1 IPC 适配版）：
 * - channel 命名：'file:download-list' / 'file:download-zip' / 'file:download-read'
 *
 * 测试覆盖：
 * - registerFileDownloadHandlers 调用 ipcMain.handle 3 次
 * - channel 名严格匹配
 * - handler 转发到 services.fileDownloadService
 * - 错误传播
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

const { registerFileDownloadHandlers, FILE_DOWNLOAD_CHANNELS } = await import(
  '@main/core/router/fileDownloadRouter'
);

describe('FILE_DOWNLOAD_CHANNELS 常量', () => {
  it('包含 3 个 channel', () => {
    expect(FILE_DOWNLOAD_CHANNELS).toEqual(
      expect.arrayContaining(['file:download-list', 'file:download-zip', 'file:download-read']),
    );
    expect(FILE_DOWNLOAD_CHANNELS).toHaveLength(3);
  });
});

describe('registerFileDownloadHandlers / IPC 契约', () => {
  let ipcMain: { handle: ReturnType<typeof vi.fn> };
  let services: {
    fileDownloadService: {
      list: ReturnType<typeof vi.fn>;
      zip: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    ipcMain = { handle: vi.fn() };
    services = {
      fileDownloadService: {
        list: vi.fn().mockResolvedValue({ files: [], count: 0 }),
        zip: vi.fn().mockResolvedValue({ path: '/tmp/out.zip' }),
        read: vi.fn().mockResolvedValue({ content: 'data', size: 4 }),
      },
    };
  });

  it('注册 3 个 IPC handler', () => {
    registerFileDownloadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileDownloadHandlers>[1],
    );
    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
  });

  it('注册的 channel 名严格匹配', () => {
    registerFileDownloadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileDownloadHandlers>[1],
    );
    const channels = ipcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual([
      'file:download-list',
      'file:download-zip',
      'file:download-read',
    ]);
  });
});

describe('handler 行为 / IPC 调用转发', () => {
  let ipcMain: { handle: ReturnType<typeof vi.fn> };
  let services: {
    fileDownloadService: {
      list: ReturnType<typeof vi.fn>;
      zip: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    ipcMain = { handle: vi.fn() };
    services = {
      fileDownloadService: {
        list: vi.fn().mockResolvedValue({ files: [], count: 0 }),
        zip: vi.fn().mockResolvedValue({ path: '/tmp/out.zip' }),
        read: vi.fn().mockResolvedValue({ content: 'data', size: 4 }),
      },
    };
    registerFileDownloadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileDownloadHandlers>[1],
    );
  });

  it('file:download-list 转发', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      (c) => c[0] === 'file:download-list',
    )![1] as (e: unknown) => Promise<unknown>;
    const result = await handler({});
    expect(services.fileDownloadService.list).toHaveBeenCalled();
    expect(result).toEqual({ files: [], count: 0 });
  });

  it('file:download-zip 转发 paths + zipFilename', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      (c) => c[0] === 'file:download-zip',
    )![1] as (e: unknown, paths: string[], zipFilename?: string) => Promise<unknown>;
    const result = await handler({}, ['/a.md', '/b.md'], 'bundle');
    expect(services.fileDownloadService.zip).toHaveBeenCalledWith(['/a.md', '/b.md'], 'bundle');
    expect(result).toEqual({ path: '/tmp/out.zip' });
  });

  it('file:download-read 转发 fileId', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      (c) => c[0] === 'file:download-read',
    )![1] as (e: unknown, fileId: string) => Promise<unknown>;
    const result = await handler({}, 'f1');
    expect(services.fileDownloadService.read).toHaveBeenCalledWith('f1');
    expect(result).toEqual({ content: 'data', size: 4 });
  });

  it('service 抛错时 handler reject', async () => {
    services.fileDownloadService.read = vi.fn().mockRejectedValue(new Error('not found'));
    const handler = ipcMain.handle.mock.calls.find(
      (c) => c[0] === 'file:download-read',
    )![1] as (e: unknown, fileId: string) => Promise<unknown>;
    await expect(handler({}, 'f1')).rejects.toThrow('not found');
  });
});

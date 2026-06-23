/**
 * fileUploadRouter（文件上传 IPC handlers）单元测试
 *
 * 1:1 翻译自 `app/core/router/file_upload_router.py`（Phase 1 IPC 版）：
 * - 注册到 `ipcMain.handle(channel, handler)` 而非 FastAPI APIRouter
 * - channel 命名：'file:upload' / 'file:upload-base64' / 'file:list' / 'file:delete'
 *
 * 测试覆盖：
 * - registerFileUploadHandlers 调用 ipcMain.handle 4 次
 * - channel 名严格匹配
 * - handler 调用 services.fileService 转发
 * - 文件计数 + 列表 + 删除 IPC channel 契约
 * - 错误传播（service 抛错 → IPC reject）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcMain } from 'electron';

const { registerFileUploadHandlers, FILE_UPLOAD_CHANNELS } = await import(
  '@main/core/router/fileUploadRouter'
);

describe('FILE_UPLOAD_CHANNELS 常量', () => {
  it('包含 4 个 channel', () => {
    expect(FILE_UPLOAD_CHANNELS).toEqual(
      expect.arrayContaining(['file:upload', 'file:upload-base64', 'file:list', 'file:delete']),
    );
    expect(FILE_UPLOAD_CHANNELS).toHaveLength(4);
  });
});

describe('registerFileUploadHandlers / IPC 契约', () => {
  let ipcMain: { handle: ReturnType<typeof vi.fn> };
  let services: {
    fileService: {
      upload: ReturnType<typeof vi.fn>;
      uploadBase64: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    ipcMain = { handle: vi.fn() };
    services = {
      fileService: {
        upload: vi.fn().mockResolvedValue({ count: 2 }),
        uploadBase64: vi.fn().mockResolvedValue({ count: 1 }),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({ deleted: 1 }),
      },
    };
  });

  it('注册 4 个 IPC handler', () => {
    registerFileUploadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileUploadHandlers>[1],
    );
    expect(ipcMain.handle).toHaveBeenCalledTimes(4);
  });

  it('注册的 channel 名严格匹配', () => {
    registerFileUploadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileUploadHandlers>[1],
    );
    const channels = ipcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual([
      'file:upload',
      'file:upload-base64',
      'file:list',
      'file:delete',
    ]);
  });

  it('每个 channel 的 handler 是函数', () => {
    registerFileUploadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileUploadHandlers>[1],
    );
    for (const call of ipcMain.handle.mock.calls) {
      expect(typeof call[1]).toBe('function');
    }
  });
});

describe('handler 行为 / IPC 调用转发', () => {
  let ipcMain: { handle: ReturnType<typeof vi.fn> };
  let services: {
    fileService: {
      upload: ReturnType<typeof vi.fn>;
      uploadBase64: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    ipcMain = { handle: vi.fn() };
    services = {
      fileService: {
        upload: vi.fn().mockResolvedValue({ count: 2 }),
        uploadBase64: vi.fn().mockResolvedValue({ count: 1 }),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({ deleted: 1 }),
      },
    };
    registerFileUploadHandlers(
      ipcMain as unknown as IpcMain,
      services as unknown as Parameters<typeof registerFileUploadHandlers>[1],
    );
  });

  it('file:upload 转发到 fileService.upload(files)', async () => {
    const handler = ipcMain.handle.mock.calls.find((c) => c[0] === 'file:upload')![1] as (
      e: unknown,
      files: unknown[],
    ) => Promise<unknown>;
    const result = await handler({}, [{ name: 'a.txt' }]);
    expect(services.fileService.upload).toHaveBeenCalledWith([{ name: 'a.txt' }]);
    expect(result).toEqual({ count: 2 });
  });

  it('file:upload-base64 转发到 fileService.uploadBase64', async () => {
    const handler = ipcMain.handle.mock.calls.find(
      (c) => c[0] === 'file:upload-base64',
    )![1] as (e: unknown, payloads: unknown[]) => Promise<unknown>;
    const result = await handler({}, [{ name: 'b.png', data: 'data:image/png;base64,xx' }]);
    expect(services.fileService.uploadBase64).toHaveBeenCalled();
    expect(result).toEqual({ count: 1 });
  });

  it('file:list 转发到 fileService.list', async () => {
    const handler = ipcMain.handle.mock.calls.find((c) => c[0] === 'file:list')![1] as (
      e: unknown,
    ) => Promise<unknown>;
    const result = await handler({});
    expect(services.fileService.list).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('file:delete 转发到 fileService.delete(fileIds)', async () => {
    const handler = ipcMain.handle.mock.calls.find((c) => c[0] === 'file:delete')![1] as (
      e: unknown,
      ids: string[],
    ) => Promise<unknown>;
    const result = await handler({}, ['f1', 'f2']);
    expect(services.fileService.delete).toHaveBeenCalledWith(['f1', 'f2']);
    expect(result).toEqual({ deleted: 1 });
  });

  it('service 抛错时 handler 抛错（IPC reject）', async () => {
    services.fileService.upload = vi.fn().mockRejectedValue(new Error('upload failed'));
    const handler = ipcMain.handle.mock.calls.find((c) => c[0] === 'file:upload')![1] as (
      e: unknown,
      files: unknown[],
    ) => Promise<unknown>;
    await expect(handler({}, [])).rejects.toThrow('upload failed');
  });
});

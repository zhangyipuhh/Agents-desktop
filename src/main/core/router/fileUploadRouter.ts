/**
 * fileUploadRouter - 文件上传 IPC handlers
 *
 * 1:1 翻译自 `app/core/router/file_upload_router.py`（**Phase 1 IPC 适配版**）。
 *
 * ## 设计改造
 * - Python 版注册 FastAPI `APIRouter` 的 `@router.post('/uploadfile')`
 * - TS 版注册到 Electron `ipcMain.handle(channel, handler)`
 * - channel 命名：`file:upload` / `file:upload-base64` / `file:list` / `file:delete`
 * - handler 签名：`(event, payload) => Promise<unknown>`
 *
 * ## Phase 1 范围
 * - 仅注册 IPC 路由 + 转发到 `services.fileService`
 * - 真实上传/列表/删除逻辑由 `FileService`（Phase 4 实现）提供
 * - channel 字符串常量集中导出，便于 preload `contextBridge` 引用
 *
 * ## Phase 4 接入
 * - 实现 `FileService.upload / uploadBase64 / list / delete`
 * - 复用本路由的 channel 名（preload 已绑定）
 */
import type { IpcMain } from 'electron';

/** Channel 常量（与 preload 暴露的 API 一一对应） */
export const FILE_UPLOAD_CHANNELS = [
  'file:upload',
  'file:upload-base64',
  'file:list',
  'file:delete',
] as const;

export type FileUploadChannel = (typeof FILE_UPLOAD_CHANNELS)[number];

/** 文件上传 payload（单个文件元信息） */
export interface FileUploadPayload {
  name: string;
  /** base64 内容（与 file:upload-base64 配合）或临时路径（与 file:upload 配合） */
  data?: string;
  path?: string;
  size?: number;
  type?: string;
}

/** 上传响应 */
export interface FileUploadResponse {
  files: Array<{
    file_id: string;
    name: string;
    stored_path: string;
    file_type: string;
    file_size: number;
  }>;
  count: number;
}

/** 文件列表项 */
export interface FileListItem {
  file_id: string;
  name: string;
  stored_path: string;
  file_type: string;
  file_size: number;
  created_at: number;
}

/** 删除响应 */
export interface FileDeleteResponse {
  deleted: number;
}

/** FileService 接口契约（实现由 Phase 4 FileService 提供） */
export interface FileServiceLike {
  upload(files: FileUploadPayload[]): Promise<FileUploadResponse>;
  uploadBase64(payloads: FileUploadPayload[]): Promise<FileUploadResponse>;
  list(): Promise<FileListItem[]>;
  delete(fileIds: string[]): Promise<FileDeleteResponse>;
}

/** services 容器：路由需要的依赖 */
export interface FileRouterServices {
  fileService: FileServiceLike;
}

/**
 * 注册文件上传相关 IPC handlers
 *
 * @param ipcMain Electron 主进程 IPC 注册对象
 * @param services 路由依赖（FileService 等）
 *
 * @example
 *   // electron/main.ts
 *   registerFileUploadHandlers(ipcMain, { fileService });
 */
export function registerFileUploadHandlers(
  ipcMain: IpcMain,
  services: FileRouterServices,
): void {
  // channel: 'file:upload'
  // 入参: FileUploadPayload[]
  // 出参: Promise<FileUploadResponse>
  ipcMain.handle('file:upload', async (_event, files: FileUploadPayload[]) => {
    return services.fileService.upload(files);
  });

  // channel: 'file:upload-base64'
  // 入参: FileUploadPayload[]（含 base64 data）
  // 出参: Promise<FileUploadResponse>
  ipcMain.handle('file:upload-base64', async (_event, payloads: FileUploadPayload[]) => {
    return services.fileService.uploadBase64(payloads);
  });

  // channel: 'file:list'
  // 入参: 无
  // 出参: Promise<FileListItem[]>
  ipcMain.handle('file:list', async () => {
    return services.fileService.list();
  });

  // channel: 'file:delete'
  // 入参: fileIds: string[]
  // 出参: Promise<FileDeleteResponse>
  ipcMain.handle('file:delete', async (_event, fileIds: string[]) => {
    return services.fileService.delete(fileIds);
  });
}

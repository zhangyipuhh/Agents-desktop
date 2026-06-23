/**
 * fileDownloadRouter - 文件下载 IPC handlers
 *
 * 1:1 翻译自 `app/core/router/file_download_router.py`（**Phase 1 IPC 适配版**）。
 *
 * ## 设计改造
 * - Python 版：`APIRouter` + `StreamingResponse`
 * - TS 版：注册 `ipcMain.handle(channel, handler)`；流式响应通过 Buffer 返回
 * - channel：`file:download-list` / `file:download-zip` / `file:download-read`
 *
 * ## Phase 1 范围
 * - 仅注册 IPC 路由 + 转发到 `services.fileDownloadService`
 * - 真实实现由 `FileDownloadService`（Phase 4）提供
 *
 * ## Phase 4 接入
 * - 实现 `FileDownloadService.list / zip / read`
 * - 大文件用 `ipcMain.handle` 返回 `{content: Buffer, size}`，preload 侧构造 Blob 下载
 */
import type { IpcMain } from 'electron';

/** Channel 常量 */
export const FILE_DOWNLOAD_CHANNELS = [
  'file:download-list',
  'file:download-zip',
  'file:download-read',
] as const;

export type FileDownloadChannel = (typeof FILE_DOWNLOAD_CHANNELS)[number];

/** 可下载文件信息 */
export interface DownloadableFileInfo {
  name: string;
  path: string;
  size: number;
  modified_time: number;
  is_dir: boolean;
}

/** 文件列表响应 */
export interface FileListResponse {
  files: DownloadableFileInfo[];
  count: number;
}

/** 打包 zip 响应 */
export interface ZipResponse {
  /** zip 文件磁盘路径（preload 侧读取后构造 Blob 下载） */
  path: string;
  /** 文件大小（字节） */
  size: number;
}

/** 文件读取响应 */
export interface FileReadResponse {
  /** 文件二进制内容 */
  content: ArrayBuffer | Buffer;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  contentType: string;
}

/** FileDownloadService 接口契约 */
export interface FileDownloadServiceLike {
  list(): Promise<FileListResponse>;
  zip(paths: string[], zipFilename?: string): Promise<ZipResponse>;
  read(fileId: string): Promise<FileReadResponse>;
}

/** services 容器 */
export interface FileDownloadRouterServices {
  fileDownloadService: FileDownloadServiceLike;
}

/**
 * 注册文件下载相关 IPC handlers
 *
 * @param ipcMain Electron 主进程 IPC 注册对象
 * @param services 路由依赖（FileDownloadService 等）
 */
export function registerFileDownloadHandlers(
  ipcMain: IpcMain,
  services: FileDownloadRouterServices,
): void {
  // channel: 'file:download-list'
  // 入参: 无
  // 出参: Promise<FileListResponse>
  ipcMain.handle('file:download-list', async () => {
    return services.fileDownloadService.list();
  });

  // channel: 'file:download-zip'
  // 入参: paths: string[], zipFilename?: string
  // 出参: Promise<ZipResponse>
  ipcMain.handle('file:download-zip', async (_event, paths: string[], zipFilename?: string) => {
    return services.fileDownloadService.zip(paths, zipFilename);
  });

  // channel: 'file:download-read'
  // 入参: fileId: string
  // 出参: Promise<FileReadResponse>
  ipcMain.handle('file:download-read', async (_event, fileId: string) => {
    return services.fileDownloadService.read(fileId);
  });
}

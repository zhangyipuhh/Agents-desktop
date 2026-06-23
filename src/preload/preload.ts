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
import type { McpServerConfig } from '../shared/types/mcp';

export interface McpTestResult {
  ok: boolean;
  error?: string;
}

export interface McpListItem {
  name: string;
  type: 'sse' | 'http' | 'stdio';
  url?: string;
  command?: string;
  enabled: boolean;
}

const api = {
  /**
   * IPC channel: `ping`
   * @returns Promise<string> resolve 为 'pong'；不会 reject
   */
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  /**
   * MCP 域：mcpConfigView 等设置页通过此域读写 MCP 配置
   */
  mcp: {
    /**
     * IPC channel: `mcp:list-servers`
     * @returns Promise<McpServerConfig[]> 全部 server 列表
     */
    listServers: (): Promise<McpServerConfig[]> => ipcRenderer.invoke('mcp:list-servers'),

    /**
     * IPC channel: `mcp:list-tools`
     * @param serverName string
     * @returns Promise<unknown[]> 该 server 暴露的工具
     */
    listTools: (serverName: string): Promise<unknown[]> =>
      ipcRenderer.invoke('mcp:list-tools', serverName),

    /**
     * IPC channel: `mcp:test-connection`
     * @param serverName string
     * @returns Promise<McpTestResult>
     */
    testConnection: (serverName: string): Promise<McpTestResult> =>
      ipcRenderer.invoke('mcp:test-connection', serverName),

    /**
     * IPC channel: `mcp:add-server`
     * @param server McpServerConfig
     * @returns Promise<void>
     */
    addServer: (server: McpServerConfig): Promise<void> =>
      ipcRenderer.invoke('mcp:add-server', server),

    /**
     * IPC channel: `mcp:update-server`
     * @param name string
     * @param patch Partial<McpServerConfig>
     * @returns Promise<void>
     */
    updateServer: (name: string, patch: Partial<McpServerConfig>): Promise<void> =>
      ipcRenderer.invoke('mcp:update-server', name, patch),

    /**
     * IPC channel: `mcp:remove-server`
     * @param name string
     * @returns Promise<void>
     */
    removeServer: (name: string): Promise<void> =>
      ipcRenderer.invoke('mcp:remove-server', name),

    /**
     * IPC channel: `mcp:toggle-server`
     * @param name string
     * @param enabled boolean
     * @returns Promise<void>
     */
    toggleServer: (name: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('mcp:toggle-server', name, enabled),

    /**
     * IPC channel: `mcp:import-yaml`
     * @param yamlPath string
     * @returns Promise<void>
     */
    importYaml: (yamlPath: string): Promise<void> =>
      ipcRenderer.invoke('mcp:import-yaml', yamlPath),

    /**
     * IPC channel: `mcp:export-yaml`
     * @param yamlPath string
     * @returns Promise<void>
     */
    exportYaml: (yamlPath: string): Promise<void> =>
      ipcRenderer.invoke('mcp:export-yaml', yamlPath),
  },
};

/**
 * 类型导出（供 `src/shared/types/window.d.ts` 引用）
 */
export type ElectronAPI = typeof api;

contextBridge.exposeInMainWorld('electronAPI', api);

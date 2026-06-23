/**
 * MCP IPC Handlers：把 UnifiedMCPClient + ConfigManager 暴露给渲染层。
 *
 * 注册的 channel（spec §3.7）：
 * - `mcp:list-servers`     → 列出所有 server 配置
 * - `mcp:list-tools`       → 列出指定 server 的工具
 * - `mcp:test-connection`  → 触发重新连接测试，返回 {ok, error?}
 * - `mcp:add-server`       → 添加 server
 * - `mcp:update-server`    → 局部更新
 * - `mcp:remove-server`    → 删除
 * - `mcp:toggle-server`    → 开关
 * - `mcp:import-yaml`      → 从 YAML 导入
 * - `mcp:export-yaml`      → 导出为 YAML
 *
 * 依赖注入而非直接 import 业务类，便于单测替换。
 */
import type { IpcMain } from 'electron';
import type { McpServerConfig } from '../shared/mcpConfigSchema';
import type { ConfigManager } from '../shared/ConfigManager';
import type { UnifiedMCPClient } from '../core/UnifiedMCPClient';

export interface McpRouterServices {
  configManager: Pick<
    ConfigManager,
    | 'load'
    | 'addServer'
    | 'updateServer'
    | 'removeServer'
    | 'toggleServer'
    | 'importFromYaml'
    | 'exportToYaml'
  >;
  mcpClient: Pick<UnifiedMCPClient, 'initialize' | 'listTools' | 'callTool' | 'setConfig' | 'close'>;
}

export type McpTestResult = { ok: boolean; error?: string };

/**
 * 注册所有 MCP IPC handlers。幂等（重复调用会重复注册，由 ipcMain 自身去重）。
 */
export function registerMcpHandlers(ipcMain: IpcMain, services: McpRouterServices): void {
  /**
   * channel: `mcp:list-servers`
   * @returns McpServerConfig[] 列表
   */
  ipcMain.handle('mcp:list-servers', async () => {
    const cfg = await services.configManager.load();
    return Object.values(cfg.servers);
  });

  /**
   * channel: `mcp:list-tools`
   * @param serverName string
   * @returns 工具列表（带 serverName 标注）
   */
  ipcMain.handle('mcp:list-tools', async (_event, serverName: string) => {
    return services.mcpClient.listTools().then((tools) =>
      tools.filter((t) => t.serverName === serverName),
    );
  });

  /**
   * channel: `mcp:test-connection`
   * 重新初始化 MCP client，触发全部 enabled server 的连接尝试。
   * @returns {ok: true} 或 {ok: false, error}
   */
  ipcMain.handle('mcp:test-connection', async (_event, _serverName: string): Promise<McpTestResult> => {
    try {
      await services.mcpClient.initialize();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /**
   * channel: `mcp:add-server`
   */
  ipcMain.handle('mcp:add-server', async (_event, server: McpServerConfig) => {
    await services.configManager.addServer(server);
  });

  /**
   * channel: `mcp:update-server`
   */
  ipcMain.handle('mcp:update-server', async (_event, name: string, patch: Partial<McpServerConfig>) => {
    await services.configManager.updateServer(name, patch);
  });

  /**
   * channel: `mcp:remove-server`
   */
  ipcMain.handle('mcp:remove-server', async (_event, name: string) => {
    await services.configManager.removeServer(name);
  });

  /**
   * channel: `mcp:toggle-server`
   */
  ipcMain.handle('mcp:toggle-server', async (_event, name: string, enabled: boolean) => {
    await services.configManager.toggleServer(name, enabled);
  });

  /**
   * channel: `mcp:import-yaml`
   */
  ipcMain.handle('mcp:import-yaml', async (_event, yamlPath: string) => {
    await services.configManager.importFromYaml(yamlPath);
  });

  /**
   * channel: `mcp:export-yaml`
   */
  ipcMain.handle('mcp:export-yaml', async (_event, yamlPath: string) => {
    await services.configManager.exportToYaml(yamlPath);
  });
}

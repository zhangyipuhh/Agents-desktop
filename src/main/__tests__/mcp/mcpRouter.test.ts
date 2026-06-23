/**
 * MCP IPC Handlers 契约测试
 *
 * 验证 registerMcpHandlers 注册了所有 spec §3.7 要求的 channel：
 * - mcp:list-servers / mcp:list-tools / mcp:test-connection
 * - mcp:add-server / mcp:update-server / mcp:remove-server / mcp:toggle-server
 * - mcp:import-yaml / mcp:export-yaml
 *
 * 每个 channel 单独 describe，验证 handler 行为（参数 + 返回值映射）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMcpHandlers } from '@main/mcp/router/mcpRouter';
import type { McpServerConfig, McpServerConfigInput, McpConfigFile } from '@main/mcp/shared/mcpConfigSchema';

interface Handler {
  (_event: unknown, ...args: unknown[]): Promise<unknown>;
}

interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>;
  /** 测试辅助：取 channel 对应 handler */
  getHandler(channel: string): Handler | undefined;
}

function makeIpcMain(): MockIpcMain {
  const channels = new Map<string, Handler>();
  const handle = vi.fn((channel: string, handler: Handler) => {
    channels.set(channel, handler);
  });
  return {
    handle,
    getHandler: (channel) => channels.get(channel),
  };
}

function makeServices() {
  const cfg: McpConfigFile = {
    version: 1,
    servers: {
      sse1: {
        name: 'sse1',
        type: 'sse',
        url: 'http://a/sse',
        enabled: true,
      } as McpServerConfig,
    },
    updatedAt: '2026-06-23T00:00:00Z',
  };
  return {
    configManager: {
      load: vi.fn().mockResolvedValue(cfg),
      save: vi.fn().mockResolvedValue(undefined),
      addServer: vi.fn().mockResolvedValue(undefined),
      updateServer: vi.fn().mockResolvedValue(undefined),
      removeServer: vi.fn().mockResolvedValue(undefined),
      toggleServer: vi.fn().mockResolvedValue(undefined),
      importFromYaml: vi.fn().mockResolvedValue(undefined),
      exportToYaml: vi.fn().mockResolvedValue(undefined),
    },
    mcpClient: {
      initialize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listTools: vi
        .fn()
        .mockResolvedValue([
          { name: 'tool-a', serverName: 'sse1' },
          { name: 'tool-b', serverName: 'sse1' },
        ]),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      setConfig: vi.fn(),
    },
  };
}

describe('registerMcpHandlers', () => {
  let ipc: MockIpcMain;
  let services: ReturnType<typeof makeServices>;

  beforeEach(() => {
    ipc = makeIpcMain();
    services = makeServices();
    registerMcpHandlers(
      ipc as never,
      services as never,
    );
  });

  describe('channel registration', () => {
    it('registers all required mcp channels', () => {
      const registered = ipc.handle.mock.calls.map((c) => c[0]);
      expect(registered).toEqual(
        expect.arrayContaining([
          'mcp:list-servers',
          'mcp:list-tools',
          'mcp:test-connection',
          'mcp:add-server',
          'mcp:update-server',
          'mcp:remove-server',
          'mcp:toggle-server',
          'mcp:import-yaml',
          'mcp:export-yaml',
        ]),
      );
    });
  });

  describe('mcp:list-servers', () => {
    it('returns all server configs from configManager', async () => {
      const handler = ipc.getHandler('mcp:list-servers');
      expect(handler).toBeDefined();
      const result = await handler!(null);
      expect(result).toEqual([
        expect.objectContaining({ name: 'sse1', type: 'sse' }),
      ]);
    });
  });

  describe('mcp:list-tools', () => {
    it('returns tools for specified server', async () => {
      const handler = ipc.getHandler('mcp:list-tools');
      expect(handler).toBeDefined();
      const result = await handler!(null, 'sse1');
      expect(result).toHaveLength(2);
    });
  });

  describe('mcp:test-connection', () => {
    it('reinitializes client and returns ok=true when no error', async () => {
      const handler = ipc.getHandler('mcp:test-connection');
      expect(handler).toBeDefined();
      const result = await handler!(null, 'sse1');
      expect(result).toEqual({ ok: true });
      expect(services.mcpClient.initialize).toHaveBeenCalled();
    });

    it('returns ok=false with error message when reinitialize fails', async () => {
      services.mcpClient.initialize.mockRejectedValueOnce(new Error('connect refused'));
      const handler = ipc.getHandler('mcp:test-connection');
      const result = await handler!(null, 'sse1');
      expect(result).toEqual({ ok: false, error: 'connect refused' });
    });
  });

  describe('mcp:add-server', () => {
    it('forwards server config to configManager', async () => {
      const handler = ipc.getHandler('mcp:add-server');
      const newServer = { name: 's2', type: 'sse', url: 'http://b/sse' } as McpServerConfigInput;
      await handler!(null, newServer);
      expect(services.configManager.addServer).toHaveBeenCalledWith(newServer);
    });
  });

  describe('mcp:update-server', () => {
    it('forwards name + patch to configManager', async () => {
      const handler = ipc.getHandler('mcp:update-server');
      const patch = { url: 'http://updated/sse' };
      await handler!(null, 'sse1', patch);
      expect(services.configManager.updateServer).toHaveBeenCalledWith('sse1', patch);
    });
  });

  describe('mcp:remove-server', () => {
    it('forwards name to configManager', async () => {
      const handler = ipc.getHandler('mcp:remove-server');
      await handler!(null, 'sse1');
      expect(services.configManager.removeServer).toHaveBeenCalledWith('sse1');
    });
  });

  describe('mcp:toggle-server', () => {
    it('forwards name + enabled flag to configManager', async () => {
      const handler = ipc.getHandler('mcp:toggle-server');
      await handler!(null, 'sse1', false);
      expect(services.configManager.toggleServer).toHaveBeenCalledWith('sse1', false);
    });
  });

  describe('mcp:import-yaml', () => {
    it('forwards yaml path to configManager', async () => {
      const handler = ipc.getHandler('mcp:import-yaml');
      await handler!(null, 'C:/legacy/config.yaml');
      expect(services.configManager.importFromYaml).toHaveBeenCalledWith('C:/legacy/config.yaml');
    });
  });

  describe('mcp:export-yaml', () => {
    it('forwards yaml path to configManager', async () => {
      const handler = ipc.getHandler('mcp:export-yaml');
      await handler!(null, 'C:/exports/mcp.yaml');
      expect(services.configManager.exportToYaml).toHaveBeenCalledWith('C:/exports/mcp.yaml');
    });
  });
});

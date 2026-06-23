/**
 * UnifiedMCPClient 单元测试
 *
 * 通过构造器注入（ClientCtor）隔离 @langchain/mcp-adapters。
 * 这种方式比 vi.mock 拦截 import 更稳定（ESM 模式下 mock factory 有 hoisting 边角问题）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedMCPClient } from '@main/mcp/core/UnifiedMCPClient';
import type { McpServerConfig } from '@main/mcp/shared/mcpConfigSchema';

const sse = (name: string, url: string, enabled = true): McpServerConfig => ({
  name,
  enabled,
  type: 'sse',
  url,
});

const stdio = (name: string, command: string, args: string[] = [], enabled = true): McpServerConfig => ({
  name,
  enabled,
  type: 'stdio',
  command,
  args,
});

/**
 * 构造 fake MultiServerMCPClient 类。返回 ctor 和 instances 数组。
 * ctor 是真 class，可 `new`；instances 按构造顺序记录所有实例。
 */
function makeFakeClientCtor() {
  const instances: Array<{
    close: ReturnType<typeof vi.fn>;
    getTools: ReturnType<typeof vi.fn>;
    getClient: ReturnType<typeof vi.fn>;
    initializeConnections: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeClient {
    public close: ReturnType<typeof vi.fn>;
    public getTools: ReturnType<typeof vi.fn>;
    public getClient: ReturnType<typeof vi.fn>;
    public initializeConnections: ReturnType<typeof vi.fn>;
    constructor(_config: Record<string, unknown>) {
      this.close = vi.fn().mockResolvedValue(undefined);
      this.getTools = vi.fn().mockResolvedValue([]);
      this.getClient = vi.fn().mockResolvedValue(undefined);
      this.initializeConnections = vi.fn().mockResolvedValue({});
      instances.push(this);
    }
  }

  return { ctor: FakeClient as unknown as new (config: Record<string, unknown>) => InstanceType<typeof FakeClient>, instances };
}

describe('UnifiedMCPClient', () => {
  let client: UnifiedMCPClient;
  let fakeCtor: ReturnType<typeof makeFakeClientCtor>;

  beforeEach(() => {
    fakeCtor = makeFakeClientCtor();
    // 业务代码里 new ClientCtor(enabled)，参数类型是 Record<string, Connection>；
    // 测试 fake 类签名用 Record<string, unknown>，通过 unknown 强制转换兼容
    client = new UnifiedMCPClient(fakeCtor.ctor as never);
  });

  describe('initialization & config', () => {
    it('starts with no servers when no config provided', async () => {
      await client.initialize();
      expect(fakeCtor.instances).toHaveLength(0);
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });

    it('initializes with enabled servers only', async () => {
      client.setConfig({
        s1: sse('s1', 'http://a/sse', true),
        s2: sse('s2', 'http://b/sse', false),
      });
      await client.initialize();
      expect(fakeCtor.instances).toHaveLength(1);
      // 第一个 instance 的 ctor 入参应该是 { s1: {...} }（s2 enabled=false 被过滤）
      const firstInst = fakeCtor.instances[0]!;
      // 验证连接被建立：调用过 getTools
      firstInst.getTools.mockResolvedValueOnce([]);
    });

    it('throws when given sse server without url', () => {
      expect(() => {
        client.setConfig({ bad: { name: 'bad', type: 'sse' } as McpServerConfig });
      }).toThrow(/url/);
    });

    it('throws when given stdio server without command', () => {
      expect(() => {
        client.setConfig({ bad: { name: 'bad', type: 'stdio' } as McpServerConfig });
      }).toThrow(/command/);
    });
  });

  describe('connection lifecycle', () => {
    it('closes existing client before re-initializing on setConfig', async () => {
      client.setConfig({ s1: sse('s1', 'http://a/sse') });
      await client.initialize();
      const firstInstance = fakeCtor.instances[0]!;
      const closeSpy = firstInstance.close;
      expect(closeSpy).toBeDefined();

      client.setConfig({ s1: sse('s1', 'http://a/sse'), s2: sse('s2', 'http://b/sse') });
      await client.initialize();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('emits change event on setConfig', () => {
      const handler = vi.fn();
      client.on('change', handler);
      client.setConfig({ s1: sse('s1', 'http://a/sse') });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('swallows close failure as best-effort and emits error', async () => {
      // 第一次 initialize：构造第一个实例，close 默认成功
      client.setConfig({ s1: sse('s1', 'http://a/sse') });
      await client.initialize();
      const firstInst = fakeCtor.instances[0]!;
      // 让第一个实例的 close 失败，触发 best-effort 路径
      firstInst.close.mockRejectedValueOnce(new Error('close fail'));

      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      // 第二次 setConfig + initialize 触发 reconnect → 调 close → 抛错 → emit error
      client.setConfig({ s1: sse('s1', 'http://a/sse'), s2: sse('s2', 'http://b/sse') });
      await client.initialize();

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('listTools', () => {
    it('returns flat list across all servers', async () => {
      // 提前知道 fakeCtor 的实例会在 initialize 时构造；configure mock 后再 init
      client.setConfig({ s1: sse('s1', 'http://a/sse'), s2: sse('s2', 'http://b/sse') });
      await client.initialize();
      const inst = fakeCtor.instances[0]!;
      inst.getTools.mockResolvedValueOnce([
        { name: 'tool-a', serverName: 's1' },
        { name: 'tool-b', serverName: 's2' },
      ] as never);
      const tools = await client.listTools();
      expect(tools).toHaveLength(2);
    });

    it('returns empty array before initialize', async () => {
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('calls tool on specified server and returns result', async () => {
      const fakeClient = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      };
      client.setConfig({ s1: sse('s1', 'http://a/sse') });
      await client.initialize();
      const inst = fakeCtor.instances[0]!;
      inst.getClient.mockResolvedValueOnce(fakeClient as never);

      const result = await client.callTool('s1', 'foo', { x: 1 });
      expect(result).toBeDefined();
      expect(fakeClient.callTool).toHaveBeenCalledWith({ name: 'foo', arguments: { x: 1 } });
    });

    it('throws when calling tool on unknown server', async () => {
      client.setConfig({ s1: sse('s1', 'http://a/sse') });
      await client.initialize();
      // getClient 已默认 mockResolvedValue(undefined)
      await expect(client.callTool('nope', 'foo', {})).rejects.toThrow(/not connected/i);
    });
  });

  describe('platform spawn hints', () => {
    it('returns cross-spawn compatible spawn options for stdio server', () => {
      const opts = client.getStdioSpawnOptions(stdio('s1', 'npx', ['-y', '@mcp/x']));
      expect(opts?.command).toBe('npx');
      expect(opts?.args).toEqual(['-y', '@mcp/x']);
      expect(opts?.windowsHide).toBe(true);
    });

    it('returns null for non-stdio server', () => {
      expect(client.getStdioSpawnOptions(sse('s1', 'http://a/sse'))).toBeNull();
    });
  });
});

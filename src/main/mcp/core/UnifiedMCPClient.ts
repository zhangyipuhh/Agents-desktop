/**
 * UnifiedMCPClient：包装 `@langchain/mcp-adapters` 的 MultiServerMCPClient。
 *
 * 职责：
 * 1. 持有当前生效的 server 集合（来自 ConfigManager 推送）
 * 2. 转换本工程 schema（`McpServerConfig`）→ 适配器期望的 `Connection` 形态
 * 3. 只连接 `enabled=true` 的 server
 * 4. 配置变更时自动重建连接（`change` 事件）
 * 5. 暴露 `callTool(server, tool, args)` —— 适配器 TS 版未直接公开，走 `getClient().callTool()`
 * 6. 暴露 `getStdioSpawnOptions(server)` —— Windows 下供外部用 `cross-spawn` 启动子进程
 *
 * 设计要点：
 * - `setConfig` 是同步的；`initialize` 是异步的（建立连接）；分离两者便于在拿到配置时立即锁定语义
 * - `close` 失败不向上抛（best-effort），避免热加载时单个 server 阻塞其他 server
 * - `error` 事件用于向外传递 non-fatal 错误
 */
import { EventEmitter } from 'node:events';
import { MultiServerMCPClient as DefaultMultiServerMCPClient } from '@langchain/mcp-adapters';
import type { Connection } from '@langchain/mcp-adapters';
import type { McpServerConfig } from '../shared/mcpConfigSchema';

/** MultiServerMCPClient 构造器类型（用于可注入式 mock） */
export type MultiServerMCPClientCtor = new (
  config: Record<string, Connection>,
) => DefaultMultiServerMCPClient;

/**
 * 内部工具：附加 server 名到 tool 对象上（适配器在 tool_name_prefix=false 时不会自动加 serverName）
 */
export interface McpTool {
  name: string;
  description?: string;
  serverName: string;
  schema?: unknown;
  invoke?: (args: unknown) => Promise<unknown>;
}

/**
 * stdio 子进程启动选项（Windows 兼容：cross-spawn + windowsHide）
 */
export interface StdioSpawnOptions {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Windows 必填：避免 spawn 时弹出控制台窗口 */
  windowsHide: boolean;
  /** cwd 可选 */
  cwd?: string;
}

/**
 * callTool 返回的标准化结果
 */
export interface McpCallResult {
  content: Array<{ type: string; text?: string; data?: unknown; mimeType?: string }>;
  isError?: boolean;
}

export class UnifiedMCPClient extends EventEmitter {
  private client: DefaultMultiServerMCPClient | null = null;
  private servers: Record<string, McpServerConfig> = {};
  /** 构造器依赖（默认从 @langchain/mcp-adapters 导入，测试可替换） */
  private readonly ClientCtor: MultiServerMCPClientCtor;

  /**
   * @param ClientCtor 可选：注入 MultiServerMCPClient 构造器（测试用）；默认使用真实适配器
   */
  constructor(ClientCtor?: MultiServerMCPClientCtor) {
    super();
    this.ClientCtor = ClientCtor ?? DefaultMultiServerMCPClient;
  }

  /**
   * 直接注入一个 MultiServerMCPClient（用于测试或自定义 transport）。
   * 优先级高于 `setConfig` 自动构造。
   */
  setClient(c: DefaultMultiServerMCPClient): void {
    this.client = c;
  }

  /**
   * 切换整体配置并重建底层连接。
   * 内部会先 best-effort `close` 旧连接，再 `initializeConnections()` 新连接。
   */
  setConfig(servers: Record<string, McpServerConfig>): void {
    // 校验：sse/http 必须有 url，stdio 必须有 command
    for (const [, cfg] of Object.entries(servers)) {
      if ((cfg.type === 'sse' || cfg.type === 'http') && !cfg.url) {
        throw new Error(`server ${cfg.name}: url is required for ${cfg.type}`);
      }
      if (cfg.type === 'stdio' && !cfg.command) {
        throw new Error(`server ${cfg.name}: command is required for stdio`);
      }
    }
    this.servers = servers;
    this.emit('change', { servers: Object.keys(servers).filter((k) => servers[k]?.enabled) });
  }

  /**
   * 建立/重建立所有 enabled server 的连接。
   * 失败的连接会被跳过（旧 client 仍持有已成功的连接）。
   */
  async initialize(): Promise<void> {
    await this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        this.emit('error', e);
      }
    }

    const enabled = Object.fromEntries(
      Object.entries(this.servers)
        .filter(([, c]) => c?.enabled)
        .map(([name, c]) => [name, this.toConnection(c)]),
    );

    if (Object.keys(enabled).length === 0) {
      this.client = null;
      return;
    }

    this.client = new this.ClientCtor(enabled);
  }

  /**
   * 把本工程 `McpServerConfig` 转换为适配器 `Connection`。
   * 关键点：stdio 必须显式 `transport: 'stdio'`，否则适配器会按字段推断
   */
  private toConnection(cfg: McpServerConfig): Connection {
    if (cfg.type === 'sse') {
      return {
        transport: 'sse',
        url: cfg.url!,
        headers: cfg.headers,
        reconnect: { enabled: true, maxAttempts: 3, delayMs: 1000 },
      };
    }
    if (cfg.type === 'http') {
      return {
        transport: 'http',
        url: cfg.url!,
        headers: cfg.headers,
        reconnect: { enabled: true, maxAttempts: 3, delayMs: 1000 },
        automaticSSEFallback: true,
      };
    }
    // stdio
    return {
      transport: 'stdio',
      command: cfg.command!,
      args: cfg.args ?? [],
      env: cfg.env,
      stderr: 'pipe',
      windowsHide: true,
      restart: { enabled: true, maxAttempts: 3, delayMs: 1000 },
    };
  }

  /**
   * 列出所有 enabled server 暴露的工具（扁平）。
   */
  async listTools(): Promise<McpTool[]> {
    if (!this.client) return [];
    const tools = await this.client.getTools();
    return tools.map((t) => {
      const tool = t as unknown as { name: string; description?: string; schema?: unknown };
      // 适配器默认不附加 serverName；尝试从 tool 的 lc_kwargs 推断（如果开了 tool_name_prefix）
      const serverName = (t as unknown as { serverName?: string }).serverName ?? '';
      return {
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        serverName,
        invoke: (args: unknown) => t.invoke(args as never),
      };
    });
  }

  /**
   * 调用指定 server 上的 tool。
   */
  async callTool(serverName: string, toolName: string, args: unknown): Promise<McpCallResult> {
    if (!this.client) throw new Error('MCP client not initialized');
    const client = await this.client.getClient(serverName);
    if (!client) throw new Error(`server ${serverName} is not connected`);
    const result = (await client.callTool({ name: toolName, arguments: args })) as McpCallResult;
    return result;
  }

  /**
   * 关闭所有连接。
   */
  async close(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.close();
    } finally {
      this.client = null;
    }
  }

  /**
   * 给 stdio server 提供 cross-spawn 兼容的启动参数。
   * 外部可以基于此用 cross-spawn 启动真正的子进程（适配器内部已用 spawn 包装，
   * 但若需要替换为 cross-spawn 解决 Windows 命令行问题，可参考此返回）。
   */
  getStdioSpawnOptions(cfg: McpServerConfig): StdioSpawnOptions | null {
    if (cfg.type !== 'stdio' || !cfg.command) return null;
    return {
      command: cfg.command,
      args: cfg.args ?? [],
      env: cfg.env,
      windowsHide: true,
      cwd: undefined,
    };
  }
}

/**
 * MCP 配置管理器：负责 userData/mcp-config.json 的持久化、增删改、事件广播、YAML 兼容导入。
 *
 * 存储布局：
 * - 用户配置：`<userDataDir>/mcp-config.json`
 * - 种子配置（首次启动使用，可选）：`<seedConfigPath>`，通常随包发布的 `resources/default-mcp-config.json`
 * - 兼容旧版：`importFromYaml` 支持从 `feature-agent-core` 的 `config.yaml` 一次性迁移
 *
 * 事件：
 * - `change`：每次写盘后触发（payload：完整 config）
 * - `add` / `update` / `remove` / `toggle`：细粒度操作事件
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import {
  McpConfigFileSchema,
  McpServerConfigSchema,
  type McpConfigFile,
  type McpServerConfig,
  type McpServerConfigInput,
} from './mcpConfigSchema';

export interface ConfigManagerOptions {
  /** Electron `app.getPath('userData')` 解析得到的目录 */
  userDataDir: string;
  /** 首次启动时的种子配置 JSON 路径（可选） */
  seedConfigPath?: string;
}

export interface ToggleEvent {
  name: string;
  enabled: boolean;
}

export interface UpdateEvent {
  name: string;
  patch: Partial<McpServerConfig>;
}

export interface RemoveEvent {
  name: string;
}

/**
 * 事件类型：基于 Node EventEmitter，使用强类型辅助
 */
export interface ConfigManagerEventMap {
  change: [McpConfigFile];
  add: [McpServerConfig];
  update: [UpdateEvent];
  remove: [RemoveEvent];
  toggle: [ToggleEvent];
}

/**
 * 类型安全的事件订阅函数（向后兼容 EventEmitter.on 的字符串签名）
 */
export type ConfigManagerEmitter = ConfigManager & {
  on<K extends keyof ConfigManagerEventMap>(
    event: K,
    listener: (...args: ConfigManagerEventMap[K]) => void,
  ): ConfigManager;
  emit<K extends keyof ConfigManagerEventMap>(
    event: K,
    ...args: ConfigManagerEventMap[K]
  ): boolean;
};

const CONFIG_FILENAME = 'mcp-config.json';

export class ConfigManager extends EventEmitter {
  private readonly filePath: string;
  private readonly seedPath: string | undefined;
  private cache: McpConfigFile | null = null;

  constructor(opts: ConfigManagerOptions) {
    super();
    this.filePath = path.join(opts.userDataDir, CONFIG_FILENAME);
    this.seedPath = opts.seedConfigPath;
  }

  /**
   * 加载配置。优先级：userData 现有文件 → seed 文件 → 默认空配置。
   *
   * @returns 校验通过的 McpConfigFile
   * @throws 当现有文件存在但解析失败或 schema 不匹配时抛出
   */
  async load(): Promise<McpConfigFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') {
        return await this.bootstrap();
      }
      throw e;
    }

    const parsed = McpConfigFileSchema.parse(JSON.parse(raw));
    this.cache = parsed;
    return parsed;
  }

  /**
   * 首次启动的引导逻辑：尝试读 seed，否则用空配置落盘。
   */
  private async bootstrap(): Promise<McpConfigFile> {
    let seed: McpConfigFile = {
      version: 1,
      servers: {},
      updatedAt: new Date().toISOString(),
    };
    if (this.seedPath) {
      try {
        const raw = await fs.readFile(this.seedPath, 'utf-8');
        seed = McpConfigFileSchema.parse(JSON.parse(raw));
      } catch {
        // seed 缺失或损坏：忽略，使用默认空配置
      }
    }
    await this.persist(seed);
    return seed;
  }

  /**
   * 写入磁盘并刷新缓存（不触发事件，由调用方决定事件语义）。
   */
  private async persist(cfg: McpConfigFile): Promise<McpConfigFile> {
    const validated = McpConfigFileSchema.parse({
      ...cfg,
      updatedAt: new Date().toISOString(),
    });
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(validated, null, 2), 'utf-8');
    this.cache = validated;
    return validated;
  }

  /**
   * 显式保存任意配置（一般由内部方法调用，也可由外部整体替换）。
   */
  async save(cfg: McpConfigFile): Promise<void> {
    const validated = await this.persist(cfg);
    this.emit('change', validated);
  }

  /**
   * 添加新 server。重复名称会拒绝。
   *
   * @param server 待添加的 server 配置（name 必填；其他字段可省略走 default）
   * @throws 重名 / Zod 校验失败时抛出
   */
  async addServer(server: McpServerConfigInput): Promise<void> {
    const cfg = this.cache ?? (await this.load());
    if (cfg.servers[server.name]) {
      throw new Error(`Server ${server.name} already exists`);
    }
    const validated = McpServerConfigSchema.parse(server);
    cfg.servers[server.name] = validated;
    const persisted = await this.persist(cfg);
    this.emit('add', validated);
    this.emit('change', persisted);
  }

  /**
   * 部分更新 server（patch 语义，深合并）。不存在时拒绝。
   */
  async updateServer(name: string, patch: Partial<McpServerConfig>): Promise<void> {
    const cfg = this.cache ?? (await this.load());
    const existing = cfg.servers[name];
    if (!existing) {
      throw new Error(`Server ${name} not found`);
    }
    const merged = McpServerConfigSchema.parse({ ...existing, ...patch, name });
    cfg.servers[name] = merged;
    const persisted = await this.persist(cfg);
    this.emit('update', { name, patch });
    this.emit('change', persisted);
  }

  /**
   * 删除 server。不存在时拒绝。
   */
  async removeServer(name: string): Promise<void> {
    const cfg = this.cache ?? (await this.load());
    if (!cfg.servers[name]) {
      throw new Error(`Server ${name} not found`);
    }
    delete cfg.servers[name];
    const persisted = await this.persist(cfg);
    this.emit('remove', { name });
    this.emit('change', persisted);
  }

  /**
   * 切换 enabled 标志。
   */
  async toggleServer(name: string, enabled: boolean): Promise<void> {
    await this.updateServer(name, { enabled });
    this.emit('toggle', { name, enabled });
  }

  /**
   * 从旧版 YAML 配置（`mcp_servers: { name: { type, url|command, ... } }`）导入。
   *
   * @param yamlPath 旧 YAML 文件路径
   */
  async importFromYaml(yamlPath: string): Promise<void> {
    const raw = await fs.readFile(yamlPath, 'utf-8');
    const obj = yamlLoad(raw) as Record<string, unknown> | null;
    const servers = (obj?.['mcp_servers'] as Record<string, unknown> | undefined) ?? {};
    const cfg: McpConfigFile = {
      version: 1,
      servers: {},
      updatedAt: new Date().toISOString(),
    };
    for (const [name, serverCfg] of Object.entries(servers)) {
      cfg.servers[name] = McpServerConfigSchema.parse({ name, ...(serverCfg as object) });
    }
    await this.save(cfg);
  }

  /**
   * 导出当前配置为 YAML（便于用户备份）。
   */
  async exportToYaml(yamlPath: string): Promise<void> {
    const cfg = this.cache ?? (await this.load());
    const { dump: yamlDump } = await import('js-yaml');
    const payload = { mcp_servers: cfg.servers };
    await fs.writeFile(yamlPath, yamlDump(payload, { lineWidth: 120 }), 'utf-8');
  }
}

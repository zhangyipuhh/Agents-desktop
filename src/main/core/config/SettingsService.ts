/**
 * 应用配置 schema
 *
 * 对应原 `feature-agent-core/app/core/config/settings.py::AppSettings`。
 * 用 Zod 替代 Pydantic；提供 `load()` / `save()` 走 userData JSON 持久化。
 *
 * 关键字段：
 * - `agentChatMaxConcurrency`：Agent 聊天接口最大并发数（超出排队）
 * - `sandbox*`：沙箱容器化配置（见 SandboxSettings 子 schema）
 *
 * Phase 1.2：仅交付 AppSettings；SandboxSettings / SkillsSettings 后续在
 * Phase 1.4（skills）/ 1.7（sandbox tool）时分别补齐。
 */

import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NonEmptyStringSchema } from '@shared/types';

/**
 * 沙箱容器化配置 schema
 *
 * 对应原 `feature-agent-core/app/core/config/settings.py::SandboxSettings`。
 * 关键约束：
 * - 内存下限 64 MB
 * - CPU 范围 10-100
 * - 工作目录必须以 `/` 结尾
 */
export const SandboxSettingsSchema = z.object({
  /** Docker 部署模式：local / socket / dind / k8s */
  dockerMode: z.enum(['local', 'socket', 'dind', 'k8s']).default('local'),
  /** Docker daemon URL（socket 模式必填） */
  dockerHost: z.string().optional(),
  /** 沙箱镜像 */
  image: NonEmptyStringSchema.default('python:3.12-alpine'),
  /** 容器内存限制（MB） */
  maxMemoryMB: z.number().int().min(64).default(512),
  /** 容器 CPU 限制（百分比） */
  maxCpuPercent: z.number().min(10).max(100).default(100),
  /** 是否启用容器网络 */
  networkEnabled: z.boolean().default(false),
  /** 命令默认超时（秒） */
  defaultTimeout: z.number().int().positive().default(60),
  /** 容器内工作目录 */
  containerWorkspace: z.string().default('/workspace'),
  /** 宿主机工作目录前缀（socket 模式必填） */
  hostWorkspacePrefix: z.string().optional(),
  /** K8s 模式命名空间 */
  k8sNamespace: z.string().optional(),
  /** Docker 不可用时是否降级到本地执行 */
  fallbackToLocal: z.boolean().default(false),
});
export type SandboxSettings = z.infer<typeof SandboxSettingsSchema>;

/**
 * Skill 系统配置 schema
 *
 * 对应原 `SkillsSettings`，按子智能体维度隔离 skill 扫描根。
 * Phase 1.2 仅定义；具体扫描逻辑见 Phase 1.4 skills/loader.ts。
 */
export const SkillsSettingsSchema = z.object({
  /** 全局 skill 扫描根列表 */
  globalRoots: z.array(z.string()).default([]),
  /** 子智能体维度 skill 扫描根覆盖（如 features/map_agent/skills） */
  agentRoots: z.record(z.string(), z.array(z.string())).default({}),
  /** 是否在系统提示词中注入 <available_skills> 块 */
  renderAvailableBlock: z.boolean().default(true),
  /** Bootstrap 优先级链 */
  bootstrapPriority: z.array(z.string()).default([]),
});
export type SkillsSettings = z.infer<typeof SkillsSettingsSchema>;

/**
 * AppSettings schema（顶层）
 *
 * 所有字段都使用 `.default()` 兜底，保证部分配置文件也能启动。
 *
 * 嵌套 schema（sandbox / skills）使用 `.default(() => SandboxSettingsSchema.parse({}))`
 * 显式预解析，确保子字段的 default 全部生效。
 */
export const AppSettingsSchema = z.object({
  /** Agent 聊天接口最大并发数（超出排队等待） */
  agentChatMaxConcurrency: z.number().int().min(1).default(3),
  /** 主进程日志级别 */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** 是否启用调试模式（详细日志、dev tools 自动打开） */
  debug: z.boolean().default(false),
  /** 沙箱配置（嵌套） */
  sandbox: SandboxSettingsSchema.default(() => SandboxSettingsSchema.parse({})),
  /** Skills 配置（嵌套） */
  skills: SkillsSettingsSchema.default(() => SkillsSettingsSchema.parse({})),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/**
 * 配置服务
 *
 * 职责：
 * - 构造时校验入参（Zod safeParse）
 * - 提供 getter 访问（替代 Pydantic @property）
 * - 支持从 userData JSON 加载/保存
 *
 * Phase 1.2：实现 + 内存构造；持久化（`load` / `save`）在 Phase 1.8（Router 层）补齐。
 */
export class SettingsService {
  private readonly settings: AppSettings;

  /**
   * 构造
   *
   * @param input 配置入参（Partial；缺省用 schema 默认值）
   * @throws Error 配置不合法时抛出（含 Zod 错误信息）
   */
  constructor(input: Partial<AppSettings> = {}) {
    const result = AppSettingsSchema.safeParse(input);
    if (!result.success) {
      throw new Error(`Invalid settings: ${result.error.message}`);
    }
    this.settings = result.data;
  }

  /** Agent 聊天接口最大并发数 */
  get agentChatMaxConcurrency(): number {
    return this.settings.agentChatMaxConcurrency;
  }

  /** 主进程日志级别 */
  get logLevel(): AppSettings['logLevel'] {
    return this.settings.logLevel;
  }

  /** 是否调试模式 */
  get debug(): boolean {
    return this.settings.debug;
  }

  /** 沙箱配置（只读） */
  get sandbox(): SandboxSettings {
    return this.settings.sandbox;
  }

  /** Skills 配置（只读） */
  get skills(): SkillsSettings {
    return this.settings.skills;
  }

  /**
   * 从 JSON 文件加载
   *
   * @param filePath JSON 配置文件绝对路径；不存在时用默认值
   * @returns Promise<SettingsService> 新实例
   */
  static async load(filePath: string): Promise<SettingsService> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return new SettingsService(JSON.parse(raw));
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === 'ENOENT') {
        // 首次启动：使用默认配置
        return new SettingsService({});
      }
      throw e;
    }
  }

  /**
   * 保存到 JSON 文件
   *
   * @param filePath 目标路径
   */
  async save(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  /**
   * 导出当前配置为普通对象（用于 IPC 返回）
   *
   * @returns AppSettings 浅拷贝
   */
  toJSON(): AppSettings {
    return { ...this.settings };
  }
}

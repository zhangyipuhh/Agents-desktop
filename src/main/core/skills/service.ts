/**
 * Skill 系统（合并实现）
 *
 * 合并原 `feature-agent-core/app/core/skills/` 7 个 Python 文件的核心能力到单个文件：
 * - `SkillInfo` / `SkillsConfig`（原 schemas.py）
 * - `SkillDiscovery` 扫描与 frontmatter 解析（原 loader.py）
 * - `SkillsService` 注册中心 + agent 维度隔离（原 service.py）
 * - `loadSkillTool` 工具函数（简化版 tool.py）
 *
 * 与原 Python 版差异：
 * - 不再依赖 langchain.tools；Phase 1.4 阶段 tool 用纯函数实现，Phase 3 再包装为 LangChain StructuredTool
 * - 不再单独拆 `bootstrap.ts` / `prompt.ts` / `message_transformer.ts`；这些是 prompt 拼接，
 *   与 AgentEngine 强耦合，统一在 Phase 3.2 实现
 * - 不支持 `app/features/<agent>/skills/` 子目录硬编码（spec §3.5 中已重构为
 *   `agents/builtin/*` 资源包）；扫描根由配置驱动
 *
 * Phase 1.4 测试覆盖：
 * - schemas 校验
 * - frontmatter 解析
 * - 扫描（单目录、缺目录、重名覆盖）
 * - 注册中心单例 + agent 维度
 * - load_skill 工具
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { z } from 'zod';
import { NonEmptyStringSchema } from '@shared/types';

// ========== Schemas ==========

/**
 * Skill 元信息 schema
 *
 * - `name`：skill 唯一标识（来自 SKILL.md frontmatter `name` 字段）
 * - `description`：用途描述
 * - `location`：SKILL.md 绝对路径
 * - `content`：去除 frontmatter 后的正文
 * - `baseDir`：SKILL.md 所在目录（访问配套资源用）
 * - `agentName`：可选，标识该 skill 属于哪个 agent 维度（null = 全局）
 */
export const SkillInfoSchema = z.object({
  name: NonEmptyStringSchema,
  description: z.string().optional(),
  location: z.string().min(1),
  content: z.string(),
  baseDir: z.string().min(1),
  agentName: z.string().nullable().optional(),
});
export type SkillInfo = z.infer<typeof SkillInfoSchema>;

/**
 * Skill 系统运行时配置
 *
 * - `globalRoots`：全局 skill 扫描根（绝对路径）
 * - `agentRoots`：agent 维度 skill 扫描根（{agentName: [paths]}）
 * - `enabled`：总开关（false 时不扫描）
 */
export const SkillsConfigSchema = z.object({
  globalRoots: z.array(z.string()).default([]),
  agentRoots: z.record(z.string(), z.array(z.string())).default({}),
  enabled: z.boolean().default(true),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

// ========== Frontmatter 解析 ==========

/**
 * 解析 SKILL.md 的 YAML frontmatter
 *
 * @param raw 完整文件内容
 * @returns frontmatter 对象 + 去除 frontmatter 后的正文
 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  // 匹配以 `---` 开头、`\n` 结尾的第一行（end marker），然后捕获到下一个 `\n---\n` 之前的内容
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    return { data: {}, content: raw };
  }
  let data: Record<string, unknown> = {};
  try {
    const parsed = yamlLoad(match[1] ?? '');
    if (typeof parsed === 'object' && parsed !== null) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // YAML 解析失败：忽略 frontmatter，按无 frontmatter 处理
  }
  return { data, content: match[2] ?? '' };
}

// ========== Discovery ==========

/**
 * Skill 扫描器
 *
 * 默认扫描根为 `app/skills` 与 `.agents/skills`（相对 cwd），与原 Python 版一致；
 * 用户可通过 `extraRoots` 追加扫描根。
 */
export class SkillDiscovery {
  /** 默认扫描根（相对 projectRoot） */
  static readonly DEFAULT_ROOTS = ['app/skills', '.agents/skills'];
  /** SKILL.md 文件名 */
  static readonly SKILL_FILENAME = 'SKILL.md';

  /**
   * 扫描根目录集合，返回 skill 名称到 SkillInfo 的映射
   *
   * @param projectRoot 项目根（绝对路径）
   * @param extraRoots 追加的扫描根（绝对路径）
   * @param agentName 归属的 agent 名（null = 全局）
   * @returns skill 映射
   */
  async scan(
    projectRoot: string,
    extraRoots: string[],
    agentName: string | null = null,
  ): Promise<Record<string, SkillInfo>> {
    const skills: Record<string, SkillInfo> = {};
    for (const rel of SkillDiscovery.DEFAULT_ROOTS) {
      await this.scanDir(path.join(projectRoot, rel), skills, agentName);
    }
    for (const root of extraRoots) {
      await this.scanDir(root, skills, agentName);
    }
    return skills;
  }

  /**
   * 扫描单个目录
   *
   * @param dir 待扫描目录（绝对路径）
   * @param skills 累积字典（原地修改）
   * @param agentName 归属 agent
   */
  private async scanDir(
    dir: string,
    skills: Record<string, SkillInfo>,
    agentName: string | null,
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return; // 缺目录：静默忽略
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const skillFile = path.join(full, SkillDiscovery.SKILL_FILENAME);
      try {
        await fs.access(skillFile);
      } catch {
        continue;
      }
      const info = await this.parseSkillFile(skillFile, agentName);
      if (info) skills[info.name] = info;
    }
  }

  /**
   * 解析单个 SKILL.md 文件
   *
   * @param filePath SKILL.md 绝对路径
   * @param agentName 归属 agent
   * @returns SkillInfo 或 null（无 name 字段时）
   */
  async parseSkillFile(filePath: string, agentName: string | null): Promise<SkillInfo | null> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const { data, content } = parseFrontmatter(raw);
    const name = data['name'];
    if (typeof name !== 'string' || name.length === 0) return null;
    const description = typeof data['description'] === 'string' ? data['description'] : undefined;
    return {
      name,
      description,
      location: filePath,
      content,
      baseDir: path.dirname(filePath),
      agentName,
    };
  }
}

// ========== Service ==========

/**
 * Skill 名称未找到异常
 */
export class SkillNotFoundError extends Error {
  readonly name: string;
  readonly available: string[];
  constructor(name: string, available: string[]) {
    super(`Skill "${name}" not found. Available skills: ${available.sort().join(', ') || 'none'}`);
    this.name = 'SkillNotFoundError';
    this.name_ = name;
    this.available = available;
  }
  // 原 Python `name` 是 skill 名称，与 Error.name 冲突；用 name_ 区分
  private name_: string;
}

/**
 * Skill 注册中心
 *
 * - 不带 agentName 调用：扫描全局 + 全部 agent roots（合并视图）
 * - 带 agentName 调用：仅扫描该 agent 的 roots
 * - 测试可通过 `resetAll()` 重置全部实例
 */
export class SkillsService {
  private static instances = new Map<string | null, SkillsService>();
  private readonly skills: Record<string, SkillInfo>;
  private readonly config: SkillsConfig;
  private readonly agentName: string | null;
  private readonly projectRoot: string;

  private constructor(
    config: SkillsConfig,
    agentName: string | null,
    projectRoot: string,
    skills: Record<string, SkillInfo>,
  ) {
    this.config = config;
    this.agentName = agentName;
    this.projectRoot = projectRoot;
    this.skills = skills;
  }

  /**
   * 获取或创建 SkillsService 实例
   *
   * 缓存 key 包含 `projectRoot`：不同工程根的单例互不影响。
   *
   * @param config 运行时配置
   * @param agentName agent 维度（null = 全局）
   * @param projectRoot 项目根绝对路径
   * @returns SkillsService
   */
  static async getInstance(
    config: SkillsConfig,
    agentName: string | null = null,
    projectRoot: string = process.cwd(),
  ): Promise<SkillsService> {
    const cacheKey = `${agentName ?? '__global__'}::${projectRoot}`;
    let svc = SkillsService.instances.get(cacheKey);
    if (svc) return svc;

    if (!config.enabled) {
      svc = new SkillsService(config, agentName, projectRoot, {});
      SkillsService.instances.set(cacheKey, svc);
      return svc;
    }

    const discovery = new SkillDiscovery();
    let skills: Record<string, SkillInfo>;
    if (agentName) {
      // agent 维度：仅扫描该 agent 的根
      const roots = config.agentRoots[agentName] ?? [];
      skills = await discovery.scan(projectRoot, roots, agentName);
    } else {
      // 全局：扫描所有 agent 根 + 全局根
      skills = await discovery.scan(projectRoot, config.globalRoots, null);
      for (const [name, roots] of Object.entries(config.agentRoots)) {
        const agentSkills = await discovery.scan(projectRoot, roots, name);
        for (const [sname, info] of Object.entries(agentSkills)) {
          skills[sname] = info;
        }
      }
    }
    svc = new SkillsService(config, agentName, projectRoot, skills);
    SkillsService.instances.set(cacheKey, svc);
    return svc;
  }

  /** 仅测试用：重置全部实例 */
  static resetAll(): void {
    SkillsService.instances.clear();
  }

  /** 获取所有 skill 名称（排序） */
  all(): string[] {
    return Object.keys(this.skills).sort();
  }

  /**
   * 按名称查找 skill
   *
   * @param name skill 名称
   * @returns SkillInfo
   * @throws SkillNotFoundError 未找到
   */
  get(name: string): SkillInfo {
    const info = this.skills[name];
    if (!info) throw new SkillNotFoundError(name, this.all());
    return info;
  }

  /**
   * 尝试查找（不抛异常）
   *
   * @param name skill 名称
   * @returns SkillInfo 或 null
   */
  tryGet(name: string): SkillInfo | null {
    return this.skills[name] ?? null;
  }

  /**
   * 降级查找：先在指定 agent 维度查找，再回退到全局
   *
   * @param name skill 名
   * @param agentName 当前 agent（null = 仅全局）
   * @returns SkillInfo 或 null
   */
  static async resolveWithFallback(
    name: string,
    agentName: string | null,
    config: SkillsConfig,
    projectRoot: string,
  ): Promise<SkillInfo | null> {
    if (agentName) {
      const agentSvc = await SkillsService.getInstance(config, agentName, projectRoot);
      const info = agentSvc.tryGet(name);
      if (info) return info;
    }
    const globalSvc = await SkillsService.getInstance(config, null, projectRoot);
    return globalSvc.tryGet(name);
  }
}

// ========== 工具函数（简化版 load_skill） ==========

/** 单文件大小上限：1 MB */
const MAX_SKILL_FILE_SIZE_BYTES = 1 * 1024 * 1024;

export interface LoadSkillResult {
  ok: boolean;
  content: string;
  error?: string;
  available?: string[];
}

/**
 * 加载 skill 工具（Phase 1.4 简化版）
 *
 * Phase 3.2 会包装为 LangChain StructuredTool；此处先实现核心逻辑便于单测。
 *
 * @param name skill 名
 * @param agentName 当前 agent 名（null = 全局）
 * @param config 运行时配置
 * @param projectRoot 项目根
 * @returns LoadSkillResult
 */
export async function loadSkill(
  name: string,
  agentName: string | null,
  config: SkillsConfig,
  projectRoot: string,
): Promise<LoadSkillResult> {
  const info = await SkillsService.resolveWithFallback(name, agentName, config, projectRoot);
  if (!info) {
    const globalSvc = await SkillsService.getInstance(config, null, projectRoot);
    return {
      ok: false,
      content: '',
      error: `Skill "${name}" not found.`,
      available: globalSvc.all(),
    };
  }
  return {
    ok: true,
    content: info.content,
  };
}

/**
 * 读取 skill 配套资源文件（白名单：仅允许读取已注册 skill 的 baseDir 下文件）
 *
 * @param filePath 目标文件绝对路径
 * @param allowedBaseDirs 已注册 skill 的 baseDir 列表
 * @returns 文件内容（UTF-8）
 * @throws Error 文件不在白名单内或超过大小限制
 */
export async function readSkillFile(
  filePath: string,
  allowedBaseDirs: string[],
): Promise<string> {
  const resolved = path.resolve(filePath);
  const allowed = allowedBaseDirs.some((base) => {
    const baseResolved = path.resolve(base);
    // 必须以 base + path.sep 开头（防止 tmp/ 匹配到 tmp-evil/）
    return resolved === baseResolved || resolved.startsWith(baseResolved + path.sep);
  });
  if (!allowed) {
    throw new Error(`Access denied: ${filePath} is not within any registered skill directory`);
  }
  const stat = await fs.stat(resolved);
  if (stat.size > MAX_SKILL_FILE_SIZE_BYTES) {
    throw new Error(`File too large: ${filePath} (${stat.size} bytes > ${MAX_SKILL_FILE_SIZE_BYTES} bytes)`);
  }
  return await fs.readFile(resolved, 'utf-8');
}

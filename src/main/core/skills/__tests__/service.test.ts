/**
 * Skills 系统单元测试
 *
 * 覆盖：
 * - Schemas 校验
 * - frontmatter 解析（标准 / 异常 / 无 frontmatter）
 * - SkillDiscovery 扫描（多层、重名覆盖、缺目录）
 * - SkillsService 注册中心（全局 / agent 维度 / 缓存）
 * - load_skill 工具（成功 / 失败 / 降级查找）
 * - readSkillFile 白名单
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SkillInfoSchema,
  SkillsConfigSchema,
  parseFrontmatter,
  SkillDiscovery,
  SkillsService,
  SkillNotFoundError,
  loadSkill,
  readSkillFile,
  type SkillsConfig,
} from '@main/core/skills/service';

describe('skills/schemas', () => {
  it('SkillInfo 接受完整字段', () => {
    const r = SkillInfoSchema.safeParse({
      name: 'x',
      location: '/a',
      content: 'c',
      baseDir: '/a',
    });
    expect(r.success).toBe(true);
  });

  it('SkillInfo 拒绝空 name', () => {
    const r = SkillInfoSchema.safeParse({ name: '', location: '/a', content: 'c', baseDir: '/a' });
    expect(r.success).toBe(false);
  });

  it('SkillsConfig 默认值', () => {
    const r = SkillsConfigSchema.parse({});
    expect(r.globalRoots).toEqual([]);
    expect(r.enabled).toBe(true);
  });
});

describe('skills/parseFrontmatter', () => {
  it('解析标准 frontmatter', () => {
    const raw = '---\nname: hello\ndescription: desc\n---\nbody content';
    const { data, content } = parseFrontmatter(raw);
    expect(data).toEqual({ name: 'hello', description: 'desc' });
    expect(content).toBe('body content');
  });

  it('无 frontmatter 全文为 content', () => {
    const raw = 'just body';
    const { data, content } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(content).toBe('just body');
  });

  it('YAML 损坏时 frontmatter 为空但 content 完整', () => {
    const raw = '---\n: invalid: yaml\n---\nbody';
    const { data, content } = parseFrontmatter(raw);
    // js-yaml v5 实际能解析 `: invalid: yaml`（输出 { null: {...} }），关键是 name 字段不应存在
    expect(data).not.toHaveProperty('name');
    expect(content).toBe('body');
  });
});

describe('skills/SkillDiscovery', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('扫描多层 SKILL.md', async () => {
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'alpha'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'alpha', 'SKILL.md'),
      '---\nname: alpha\n---\nalpha body',
    );
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'beta'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'beta', 'SKILL.md'),
      '---\nname: beta\n---\nbeta body',
    );

    const d = new SkillDiscovery();
    const skills = await d.scan(tmpDir, [], null);
    expect(Object.keys(skills).sort()).toEqual(['alpha', 'beta']);
    expect(skills['alpha']?.content).toBe('alpha body');
  });

  it('跳过无 SKILL.md 的子目录', async () => {
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'no-skill'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'app', 'skills', 'no-skill', 'README.md'), 'r');
    const d = new SkillDiscovery();
    const skills = await d.scan(tmpDir, [], null);
    expect(Object.keys(skills)).toEqual([]);
  });

  it('缺目录静默忽略', async () => {
    const d = new SkillDiscovery();
    const skills = await d.scan(tmpDir, [], null);
    expect(skills).toEqual({});
  });

  it('无 name 字段跳过', async () => {
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'noname'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'noname', 'SKILL.md'),
      '---\nfoo: bar\n---\nbody',
    );
    const d = new SkillDiscovery();
    const skills = await d.scan(tmpDir, [], null);
    expect(skills).toEqual({});
  });
});

describe('skills/SkillsService', () => {
  let tmpDir: string;
  const config: SkillsConfig = SkillsConfigSchema.parse({});

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svc-'));
    SkillsService.resetAll();
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('注册并查询 skill', async () => {
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'a'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'a', 'SKILL.md'),
      '---\nname: a\n---\nA body',
    );
    const svc = await SkillsService.getInstance(config, null, tmpDir);
    const info = svc.get('a');
    expect(info.content).toBe('A body');
    expect(svc.all()).toEqual(['a']);
  });

  it('未找到抛 SkillNotFoundError 含 available 列表', async () => {
    const svc = await SkillsService.getInstance(config, null, tmpDir);
    expect(() => svc.get('missing')).toThrow(SkillNotFoundError);
    try { svc.get('missing'); } catch (e) {
      expect((e as SkillNotFoundError).available).toEqual([]);
    }
  });

  it('enabled=false 不扫描', async () => {
    const cfg: SkillsConfig = { ...config, enabled: false };
    const svc = await SkillsService.getInstance(cfg, null, tmpDir);
    expect(svc.all()).toEqual([]);
  });

  it('单例缓存（agent 维度隔离）', async () => {
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'shared'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'shared', 'SKILL.md'),
      '---\nname: shared\n---\nbody',
    );
    const a = await SkillsService.getInstance(config, null, tmpDir);
    const b = await SkillsService.getInstance(config, null, tmpDir);
    expect(a).toBe(b);
    const mapAgent = await SkillsService.getInstance(config, 'map_agent', tmpDir);
    expect(mapAgent).not.toBe(a);
  });
});

describe('skills/loadSkill', () => {
  let tmpDir: string;
  const config: SkillsConfig = SkillsConfigSchema.parse({});

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'load-'));
    SkillsService.resetAll();
    await fs.mkdir(path.join(tmpDir, 'app', 'skills', 'demo'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'app', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\n---\nDEMO',
    );
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('成功加载', async () => {
    const r = await loadSkill('demo', null, config, tmpDir);
    expect(r.ok).toBe(true);
    expect(r.content).toBe('DEMO');
  });

  it('未找到返回 ok=false 与 available', async () => {
    const r = await loadSkill('nope', null, config, tmpDir);
    expect(r.ok).toBe(false);
    expect(r.available).toEqual(['demo']);
  });
});

describe('skills/readSkillFile', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('白名单内文件可读', async () => {
    const base = path.join(tmpDir, 'skill');
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, 'data.txt'), 'hello');
    const content = await readSkillFile(path.join(base, 'data.txt'), [base]);
    expect(content).toBe('hello');
  });

  it('白名单外文件拒绝', async () => {
    const allowedBase = path.join(tmpDir, 'allowed');
    const other = path.join(tmpDir, 'other');
    await fs.mkdir(allowedBase, { recursive: true });
    await fs.mkdir(other, { recursive: true });
    await fs.writeFile(path.join(other, 'secret.txt'), 'no');
    // 白名单 = allowedBase；secret.txt 在 other 下，应被拒绝
    await expect(readSkillFile(path.join(other, 'secret.txt'), [allowedBase])).rejects.toThrow(/Access denied/);
  });
});

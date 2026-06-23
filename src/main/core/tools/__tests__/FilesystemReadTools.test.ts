/**
 * FilesystemReadTools（文件系统读取工具集）单元测试
 *
 * 对应 Python `app/core/tools/FilesystemReadTools.py` 的 1:1 TS 化（Phase 1 简化版）。
 *
 * 测试覆盖：
 * - validateRootPath：合法目录 / 不存在 / 不是目录 / 空目录
 * - explore 工具：根目录清单（Phase 1 占位）
 * - 路径解析（相对 → 绝对）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { validateRootPath, listRootEntries, explore, FILESYSTEM_READ_TOOLS } = await import(
  '@main/core/tools/FilesystemReadTools'
);

describe('validateRootPath', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-test-'));
    // mkdtemp 创建空目录,但 validateRootPath 要求非空
    await fs.writeFile(path.join(tmp, 'placeholder.txt'), 'x');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('合法目录返回绝对路径', async () => {
    const abs = await validateRootPath(tmp);
    expect(abs).toBe(path.resolve(tmp));
  });

  it('相对路径解析为绝对路径', async () => {
    const cwd = process.cwd();
    process.chdir(tmp);
    try {
      const abs = await validateRootPath('.');
      expect(path.isAbsolute(abs)).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });

  it('目录不存在 → 抛 Error', async () => {
    await expect(validateRootPath(path.join(tmp, 'nope'))).rejects.toThrow(/不存在/);
  });

  it('不是目录（是文件） → 抛 Error', async () => {
    const f = path.join(tmp, 'a.txt');
    await fs.writeFile(f, 'hi');
    await expect(validateRootPath(f)).rejects.toThrow(/不是文件夹/);
  });

  it('空目录 → 抛 Error', async () => {
    const empty = path.join(tmp, 'empty');
    await fs.mkdir(empty);
    await expect(validateRootPath(empty)).rejects.toThrow(/为空/);
  });

  it('非空目录 → 返回绝对路径', async () => {
    const abs = await validateRootPath(tmp);
    expect(abs).toBe(path.resolve(tmp));
  });
});

describe('listRootEntries', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-list-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('列出根目录直接子项', async () => {
    await fs.writeFile(path.join(tmp, 'a.txt'), 'x');
    await fs.mkdir(path.join(tmp, 'b'));
    const entries = await listRootEntries(tmp);
    expect(entries.sort()).toEqual(['a.txt', 'b']);
  });

  it('空目录返回空数组', async () => {
    const empty = path.join(tmp, 'empty');
    await fs.mkdir(empty);
    expect(await listRootEntries(empty)).toEqual([]);
  });
});

describe('explore 工具 / Phase 1 占位', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-explore-'));
    await fs.writeFile(path.join(tmp, 'doc.md'), '# hi');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('返回根目录子项清单 JSON', async () => {
    const out = await explore.invoke({ prompt: '找文档', root_path: tmp });
    const parsed = JSON.parse(out);
    expect(parsed.phase).toBe(1);
    expect(parsed.tool).toBe('explore');
    expect(parsed.root_path).toBe(path.resolve(tmp));
    expect(parsed.entries).toContain('doc.md');
  });

  it('root_path 不存在 → 抛 Error', async () => {
    await expect(
      explore.invoke({ prompt: 'x', root_path: path.join(tmp, 'nope') }),
    ).rejects.toThrow();
  });

  it('FILESYSTEM_READ_TOOLS 包含 explore', () => {
    const names = FILESYSTEM_READ_TOOLS.map((t) => t.name);
    expect(names).toContain('explore');
  });

  it('explore 工具描述与 schema 完整', () => {
    expect(explore.name).toBe('explore');
    expect(explore.description).toBeTruthy();
    expect(explore.schema).toBeDefined();
  });
});

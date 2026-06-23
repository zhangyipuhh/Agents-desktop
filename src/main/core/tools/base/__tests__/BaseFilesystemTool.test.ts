/**
 * BaseFilesystemTool 单元测试
 *
 * Phase 1 简化版验证：
 * - 构造注入字段
 * - run 校验根目录 + 列目录 + 返回占位结果
 * - emit start/stop/error 事件
 * - 错误路径：root_path 不存在 / 不是目录 / 空目录
 * - 用户停止信号（mock request）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BaseFilesystemTool, createBaseFilesystemTool } from '@main/core/tools/base/BaseFilesystemTool';

describe('BaseFilesystemTool / 构造与配置', () => {
  it('构造时保存字段', () => {
    const t = new BaseFilesystemTool({
      toolName: 'explore',
      systemPrompt: 'find files',
      maxFileSizeMb: 20,
    });
    expect(t.toolName).toBe('explore');
    expect(t.systemPrompt).toBe('find files');
    expect(t.maxFileSizeMb).toBe(20);
  });

  it('maxFileSizeMb 默认 10', () => {
    const t = new BaseFilesystemTool({ toolName: 'x', systemPrompt: 'p' });
    expect(t.maxFileSizeMb).toBe(10);
  });
});

describe('BaseFilesystemTool / 事件流', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bfs-'));
    await fs.writeFile(path.join(tmp, 'a.md'), '# a');
    await fs.writeFile(path.join(tmp, 'b.md'), '# b');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('run 触发 tool_start + tool_stop 事件（顺序）', async () => {
    const events: unknown[] = [];
    const writer = (e: unknown) => events.push(e);
    const t = new BaseFilesystemTool({ toolName: 'explore', systemPrompt: 'p' });
    await t.run({ prompt: 'list', root_path: tmp, tool_call_id: 'tc1' }, writer);
    expect(events).toHaveLength(2);
    expect((events[0] as { type: string }).type).toBe('tool_start');
    expect((events[1] as { type: string }).type).toBe('tool_stop');
    expect((events[1] as { data: { status: string } }).data.status).toBe('success');
  });

  it('writer 未传时不抛错', async () => {
    const t = new BaseFilesystemTool({ toolName: 'explore', systemPrompt: 'p' });
    const out = await t.run({ prompt: 'list', root_path: tmp, tool_call_id: 'tc1' });
    expect(out.entries.sort()).toEqual(['a.md', 'b.md']);
  });

  it('run 错误路径触发 tool_error 事件', async () => {
    const events: unknown[] = [];
    const writer = (e: unknown) => events.push(e);
    const t = new BaseFilesystemTool({ toolName: 'explore', systemPrompt: 'p' });
    await expect(
      t.run({ prompt: 'x', root_path: path.join(tmp, 'nope'), tool_call_id: 'tc2' }, writer),
    ).rejects.toThrow();
    expect((events[1] as { type: string }).type).toBe('tool_error');
    expect((events[1] as { data: { error_type: string } }).data.error_type).toBeTruthy();
  });

  it('answer 包含 entries', async () => {
    const t = new BaseFilesystemTool({ toolName: 'explore', systemPrompt: 'p' });
    const out = await t.run({ prompt: 'list', root_path: tmp, tool_call_id: 'tc3' });
    expect(out.answer).toContain('a.md');
    expect(out.answer).toContain('b.md');
    expect(out.rootPath).toBe(path.resolve(tmp));
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('BaseFilesystemTool / 用户停止信号', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bfs-stop-'));
    await fs.writeFile(path.join(tmp, 'x.txt'), 'x');
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('无 request context → isStoppedByUser=false', async () => {
    const t = new BaseFilesystemTool({ toolName: 'x', systemPrompt: 'p' });
    expect(await t.isStoppedByUser()).toBe(false);
  });

  it('request.isDisconnected() 返回 true → isStoppedByUser=true', async () => {
    const { setCurrentRequest, resetCurrentRequest } = await import('@main/core/tools/stopSignal');
    const token = setCurrentRequest({
      isDisconnected: async () => true,
    });
    try {
      const t = new BaseFilesystemTool({ toolName: 'x', systemPrompt: 'p' });
      expect(await t.isStoppedByUser()).toBe(true);
    } finally {
      resetCurrentRequest(token);
    }
  });

  it('request.isDisconnected() 抛错 → 降级为 false', async () => {
    const { setCurrentRequest, resetCurrentRequest } = await import('@main/core/tools/stopSignal');
    const token = setCurrentRequest({
      isDisconnected: async () => {
        throw new Error('boom');
      },
    });
    try {
      const t = new BaseFilesystemTool({ toolName: 'x', systemPrompt: 'p' });
      expect(await t.isStoppedByUser()).toBe(false);
    } finally {
      resetCurrentRequest(token);
    }
  });
});

describe('createBaseFilesystemTool 工厂', () => {
  it('返回 LangChain tool', () => {
    const t = createBaseFilesystemTool('explore', 'find files');
    expect(t.name).toBe('explore');
    expect(t.schema).toBeDefined();
  });

  it('tool invoke 返回 JSON 结果', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bfs-factory-'));
    await fs.writeFile(path.join(tmp, 'doc.md'), '# doc');
    try {
      const t = createBaseFilesystemTool('explore', 'p');
      const out = await t.invoke({ prompt: 'list', root_path: tmp });
      expect(typeof out).toBe('string');
      const parsed = JSON.parse(out);
      expect(parsed.entries).toContain('doc.md');
      expect(parsed.rootPath).toBe(path.resolve(tmp));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('tool invoke 错误路径抛错', async () => {
    const t = createBaseFilesystemTool('explore', 'p');
    await expect(t.invoke({ prompt: 'x', root_path: '/nonexistent-path-xyz' })).rejects.toThrow();
  });
});

// 避免 unused vi import 警告（test framework setup）
void vi;

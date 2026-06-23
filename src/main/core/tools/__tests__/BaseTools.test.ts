/**
 * BaseTools（基础工具集）单元测试
 *
 * 对应 Python `app/core/tools/BaseTools.py` 的 1:1 TS 化（Phase 1 简化版）。
 *
 * 测试覆盖：
 * - get_current_time 返回 YYYY-MM-DD HH:MM:SS 格式
 * - echo_input 回显输入
 * - BASE_TOOLS 列表包含这两个工具
 * - 工具 invoke() 能正常工作
 */
import { describe, it, expect } from 'vitest';

const { getCurrentTime, echoInput, BASE_TOOLS } = await import('@main/core/tools/BaseTools');

describe('BaseTools / 基础工具集', () => {
  it('BASE_TOOLS 包含 get_current_time + echo_input', () => {
    const names = BASE_TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_current_time', 'echo_input']));
    expect(BASE_TOOLS).toHaveLength(2);
  });

  it('get_current_time 返回 YYYY-MM-DD HH:MM:SS 格式', async () => {
    const result = await getCurrentTime.invoke({});
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('echo_input 回显输入', async () => {
    const out = await echoInput.invoke({ text: 'hello world' });
    expect(out).toBe('hello world');
  });

  it('echo_input 空字符串也透传', async () => {
    const out = await echoInput.invoke({ text: '' });
    expect(out).toBe('');
  });

  it('工具结构化 schema 存在', () => {
    expect(getCurrentTime.schema).toBeDefined();
    expect(echoInput.schema).toBeDefined();
  });
});

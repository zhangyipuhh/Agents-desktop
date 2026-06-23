/**
 * subagentRegistry（子智能体注册表）单元测试
 *
 * 1:1 翻译自 `app/core/tools/subagent_registry.py`：
 * - SUBAGENT_TOOL_NAMES 集合（默认 sandbox / explore / query_knowledge）
 * - SUBAGENT_META 字典（icon + label）
 * - isSubagentTool(toolName) 大小写不敏感判断
 * - getSubagentMeta(toolName) 获取元信息（未知工具兜底）
 * - registerSubagent / unregisterSubagent（运行时增减）
 */
import { describe, it, expect, beforeEach } from 'vitest';

const {
  SUBAGENT_TOOL_NAMES,
  SUBAGENT_META,
  isSubagentTool,
  getSubagentMeta,
  registerSubagent,
  unregisterSubagent,
  _resetRegistryForTests,
} = await import('@main/core/tools/subagentRegistry');

beforeEach(() => {
  _resetRegistryForTests();
});

describe('默认注册表', () => {
  it('包含 sandbox/explore/query_knowledge', () => {
    expect(SUBAGENT_TOOL_NAMES.has('sandbox')).toBe(true);
    expect(SUBAGENT_TOOL_NAMES.has('explore')).toBe(true);
    expect(SUBAGENT_TOOL_NAMES.has('query_knowledge')).toBe(true);
  });

  it('SUBAGENT_META 含每个 tool 的 icon/label', () => {
    expect(SUBAGENT_META['sandbox']).toEqual({ icon: '📦', label: '沙箱执行' });
    expect(SUBAGENT_META['explore']).toEqual({ icon: '🔍', label: '文件探索' });
    expect(SUBAGENT_META['query_knowledge']).toEqual({ icon: '📚', label: '知识库检索' });
  });
});

describe('isSubagentTool', () => {
  it('识别已注册工具（大小写不敏感）', () => {
    expect(isSubagentTool('sandbox')).toBe(true);
    expect(isSubagentTool('Sandbox')).toBe(true);
    expect(isSubagentTool('EXPLORE')).toBe(true);
  });

  it('未知工具返回 false', () => {
    expect(isSubagentTool('unknown')).toBe(false);
    expect(isSubagentTool('search')).toBe(false);
  });

  it('空字符串 / 非字符串 → false', () => {
    expect(isSubagentTool('')).toBe(false);
    expect(isSubagentTool(undefined as unknown as string)).toBe(false);
    expect(isSubagentTool(null as unknown as string)).toBe(false);
    expect(isSubagentTool(123 as unknown as string)).toBe(false);
  });
});

describe('getSubagentMeta', () => {
  it('已知工具返回 {icon, label}', () => {
    expect(getSubagentMeta('sandbox')).toEqual({ icon: '📦', label: '沙箱执行' });
    expect(getSubagentMeta('QUERY_KNOWLEDGE')).toEqual({ icon: '📚', label: '知识库检索' });
  });

  it('未知工具返回兜底 {🤖, tool_name}', () => {
    expect(getSubagentMeta('new_tool')).toEqual({ icon: '🤖', label: 'new_tool' });
  });

  it('空字符串 / 非字符串 → 兜底 {🤖, 子智能体}', () => {
    expect(getSubagentMeta('')).toEqual({ icon: '🤖', label: '子智能体' });
    expect(getSubagentMeta(undefined as unknown as string)).toEqual({
      icon: '🤖',
      label: '子智能体',
    });
  });

  it('返回的 meta 是副本（不影响内部表）', () => {
    const m1 = getSubagentMeta('sandbox');
    m1.icon = 'X';
    const m2 = getSubagentMeta('sandbox');
    expect(m2.icon).toBe('📦');
  });
});

describe('registerSubagent / unregisterSubagent', () => {
  it('register 添加新 tool', () => {
    registerSubagent('custom_tool', { icon: '⚡', label: '自定义' });
    expect(isSubagentTool('custom_tool')).toBe(true);
    expect(getSubagentMeta('custom_tool')).toEqual({ icon: '⚡', label: '自定义' });
  });

  it('register 大小写归一', () => {
    registerSubagent('CUSTOM', { icon: '⚡', label: 'X' });
    expect(isSubagentTool('custom')).toBe(true);
  });

  it('unregister 移除已有 tool', () => {
    expect(isSubagentTool('sandbox')).toBe(true);
    unregisterSubagent('sandbox');
    expect(isSubagentTool('sandbox')).toBe(false);
  });

  it('unregister 未知 tool 不抛错', () => {
    expect(() => unregisterSubagent('nope')).not.toThrow();
  });
});

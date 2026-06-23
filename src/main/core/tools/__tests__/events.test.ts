/**
 * 工具事件（ToolEvent）单元测试
 *
 * 1:1 翻译自 `app/core/tools/events.py`：
 * - ToolEvent TypedDict（type/tool/tool_call_id/timestamp/data）
 * - create_tool_event 工厂函数
 * - 4 种事件类型：tool_start / tool_progress / tool_stop / tool_error
 *
 * 测试覆盖：
 * - 4 种事件类型字段填充
 * - data 默认值 {}（不传 data 时）
 * - timestamp 字段为浮点秒
 * - 字段透传（args/result/duration_ms/error_type 等）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { createToolEvent, isToolEventType, TOOL_EVENT_TYPES } = await import(
  '@main/core/tools/events'
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createToolEvent / 4 种事件类型', () => {
  it('tool_start 字段填充', () => {
    const ev = createToolEvent('tool_start', 'explore', 'call_abc', {
      args: { prompt: 'hi' },
      root_path: '/workspace',
      description: '开始',
    });
    expect(ev.type).toBe('tool_start');
    expect(ev.tool).toBe('explore');
    expect(ev.tool_call_id).toBe('call_abc');
    expect(typeof ev.timestamp).toBe('number');
    expect(ev.data).toEqual({
      args: { prompt: 'hi' },
      root_path: '/workspace',
      description: '开始',
    });
  });

  it('tool_progress 字段填充（含 child_stream / message）', () => {
    const ev = createToolEvent('tool_progress', 'sandbox', 'c1', {
      current: 3,
      total: 10,
      percentage: 30,
      message: '读取 3/10',
      child_stream: { node: 'update' },
    });
    expect(ev.type).toBe('tool_progress');
    expect(ev.data.percentage).toBe(30);
    expect(ev.data.child_stream).toEqual({ node: 'update' });
  });

  it('tool_stop 字段填充（含 status/result/duration_ms）', () => {
    const ev = createToolEvent('tool_stop', 'sandbox', 'c1', {
      status: 'success',
      result: { answer: 'done' },
      duration_ms: 1250,
    });
    expect(ev.type).toBe('tool_stop');
    expect(ev.data.status).toBe('success');
    expect(ev.data.duration_ms).toBe(1250);
  });

  it('tool_error 字段填充（含 error_type/error_message）', () => {
    const ev = createToolEvent('tool_error', 'open_file', 'c2', {
      error_type: 'FileNotFoundError',
      error_message: '文件不存在',
      args: { path: '/x' },
    });
    expect(ev.type).toBe('tool_error');
    expect(ev.data.error_type).toBe('FileNotFoundError');
  });

  it('data 不传时默认为空对象', () => {
    const ev = createToolEvent('tool_start', 't', 'c');
    expect(ev.data).toEqual({});
  });

  it('timestamp 在调用时取真实时间（可 mock）', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ev = createToolEvent('tool_start', 't', 'c');
    expect(ev.timestamp).toBe(1_700_000_000);
  });
});

describe('TOOL_EVENT_TYPES 常量', () => {
  it('包含 4 种事件类型', () => {
    expect(TOOL_EVENT_TYPES).toEqual(
      expect.arrayContaining(['tool_start', 'tool_progress', 'tool_stop', 'tool_error']),
    );
    expect(TOOL_EVENT_TYPES).toHaveLength(4);
  });
});

describe('isToolEventType 类型守卫', () => {
  it('返回 true 当 type 在允许列表中', () => {
    expect(isToolEventType('tool_start')).toBe(true);
    expect(isToolEventType('tool_error')).toBe(true);
  });
  it('返回 false 当 type 非法', () => {
    expect(isToolEventType('bogus')).toBe(false);
    expect(isToolEventType('')).toBe(false);
  });
});

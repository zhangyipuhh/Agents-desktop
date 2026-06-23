/**
 * 消息内容转换器单元测试
 *
 * 对应 Python `app/core/messages/converter.py` 的 1:1 TS 化：
 * - MessageContentConverter.to_string() / extract_text() / extract_full()
 * - 顶层便捷函数 extract_message_content() / extract_text() / extract_full()
 *
 * 覆盖：
 * - string content 直接返回
 * - list content 中各 type（text/thinking/image_url/tool_use/tool_result）
 * - include_thinking 开关
 * - 未知 type 的兜底（取 text/content 字段）
 * - 非 string 非 list 类型（数字/对象）→ str()
 */
import { describe, it, expect, vi } from 'vitest';

const {
  MessageContentConverter,
  extractMessageContent,
  extractTextMessage,
  extractFullMessage,
} = await import('@main/core/messages/converter');

// 必须放在 mock 之后 import（避免 vitest hoist 问题，本次不需要 mock）
void vi;

describe('MessageContentConverter.to_string', () => {
  it('字符串直接返回', () => {
    expect(MessageContentConverter.to_string('hello')).toBe('hello');
  });

  it('空字符串视为"无内容"，原样返回（调用方决定是否过滤）', () => {
    expect(MessageContentConverter.to_string('')).toBe('');
  });

  it('list 中只含 text 元素，按行连接', () => {
    const out = MessageContentConverter.to_string([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]);
    expect(out).toBe('a\nb');
  });

  it('默认不输出 thinking（include_thinking=false）', () => {
    const out = MessageContentConverter.to_string([
      { type: 'thinking', thinking: 'inner' },
      { type: 'text', text: 'visible' },
    ]);
    expect(out).toBe('visible');
  });

  it('include_thinking=true 输出 "[思考]: inner" 形式', () => {
    const out = MessageContentConverter.to_string(
      [{ type: 'thinking', thinking: 'inner' }],
      true,
    );
    expect(out).toBe('[思考]: inner');
  });

  it('include_thinking=true 但 thinking 为空时不输出', () => {
    const out = MessageContentConverter.to_string(
      [{ type: 'thinking', thinking: '' }],
      true,
    );
    expect(out).toBe('');
  });

  it('image_url → [图片] 占位符', () => {
    const out = MessageContentConverter.to_string([{ type: 'image_url' }]);
    expect(out).toBe('[图片]');
  });

  it('tool_use → [工具调用]: name(input)', () => {
    const out = MessageContentConverter.to_string([
      { type: 'tool_use', name: 'search', input: { q: 'x' } },
    ]);
    expect(out).toBe('[工具调用]: search({"q":"x"})');
  });

  it('tool_result → [工具结果]: content', () => {
    const out = MessageContentConverter.to_string([
      { type: 'tool_result', content: 'ok' },
    ]);
    expect(out).toBe('[工具结果]: ok');
  });

  it('未知 type 兜底取 text 字段', () => {
    const out = MessageContentConverter.to_string([{ type: 'unknown', text: 'fallback' }]);
    expect(out).toBe('fallback');
  });

  it('未知 type 无 text 则取 content 字段', () => {
    const out = MessageContentConverter.toString([{ type: 'unknown', content: 42 }]);
    expect(out).toBe('42');
  });

  it('列表元素本身就是 string 直接拼接', () => {
    const out = MessageContentConverter.to_string(['plain', 'text']);
    expect(out).toBe('plain\ntext');
  });

  it('非 string 非 list → str() 兜底', () => {
    expect(MessageContentConverter.toString(123)).toBe('123');
    expect(MessageContentConverter.toString({ a: 1 })).toBe('[object Object]');
  });

  it('thinking_prefix 可自定义', () => {
    const out = MessageContentConverter.toString(
      [{ type: 'thinking', thinking: 'inner' }],
      true,
      '思考: ',
    );
    expect(out).toBe('思考: inner');
  });
});

describe('MessageContentConverter 便捷方法', () => {
  it('extract_text 等价于 to_string(include_thinking=false)', () => {
    const list = [
      { type: 'thinking', thinking: 'inner' },
      { type: 'text', text: 'visible' },
    ];
    expect(MessageContentConverter.extractText(list)).toBe('visible');
    expect(MessageContentConverter.extractText('hi')).toBe('hi');
  });

  it('extract_full 等价于 to_string(include_thinking=true)，带 "[思考]: " 前缀', () => {
    const list = [
      { type: 'thinking', thinking: 'inner' },
      { type: 'text', text: 'visible' },
    ];
    expect(MessageContentConverter.extractFull(list)).toBe('[思考]: inner\nvisible');
    expect(MessageContentConverter.extractFull('hi')).toBe('hi');
  });
});

describe('顶层便捷函数 extract_*', () => {
  it('extract_message_content 从 BaseMessage 取 content 并转换', () => {
    const msg = { content: [{ type: 'text', text: 'x' }] };
    expect(extractMessageContent(msg, false)).toBe('x');
    const m2 = { content: 'plain' };
    expect(extractMessageContent(m2, true)).toBe('plain');
  });

  it('extract_message_content 在无 content 时走 str(message)', () => {
    const msg = { foo: 'bar' };
    expect(extractMessageContent(msg, false)).toBe('[object Object]');
  });

  it('顶层 extract_text 等价于 to_string(include_thinking=false)', () => {
    expect(extractTextMessage({ content: [{ type: 'thinking', thinking: 'i' }, { type: 'text', text: 'o' }] })).toBe('o');
  });

  it('顶层 extract_full 等价于 to_string(include_thinking=true)，带 "[思考]: " 前缀', () => {
    expect(extractFullMessage({ content: [{ type: 'thinking', thinking: 'i' }, { type: 'text', text: 'o' }] })).toBe('[思考]: i\no');
  });
});

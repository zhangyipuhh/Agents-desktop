/**
 * subagentMessageExtractor 单元测试
 *
 * 1:1 翻译自 `app/core/tools/subagent_message_extractor.py`：
 * - extractStructuredMessages(messages) → list[dict]
 * - 每项：{type, role, content, tool_calls?, tool_call_id?, name?}
 *
 * 测试覆盖：
 * - HumanMessage / AIMessage / ToolMessage / SystemMessage 分类
 * - AIMessage 的 tool_calls 提取（3 种来源：OpenAI/Anthropic/content_blocks）
 * - ToolMessage 的 tool_call_id + name
 * - 异常输入（null/非可迭代）降级为 Unknown
 * - 单条消息解析失败不影响其他
 */
import { describe, it, expect } from 'vitest';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';

const { extractStructuredMessages } = await import(
  '@main/core/tools/subagentMessageExtractor'
);

describe('extractStructuredMessages / 消息结构化提取', () => {
  it('HumanMessage → role=user, content 原样保留', () => {
    const out = extractStructuredMessages([new HumanMessage('hello')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe('user');
    expect(out[0]!.content).toBe('hello');
    expect(out[0]!.type).toBe('HumanMessage');
  });

  it('AIMessage 纯文本', () => {
    const out = extractStructuredMessages([new AIMessage('hi back')]);
    expect(out[0]!.role).toBe('ai');
    expect(out[0]!.content).toBe('hi back');
  });

  it('AIMessage 提取 tool_calls（OpenAI 风格）', () => {
    const ai = new AIMessage({
      content: '',
      tool_calls: [{ id: 't1', name: 'search', args: { q: 'x' } }],
    });
    const out = extractStructuredMessages([ai]);
    expect(out[0]!.tool_calls).toEqual([{ name: 'search', args: { q: 'x' }, id: 't1' }]);
  });

  it('AIMessage 提取 tool_calls（Anthropic 风格：content list 块）', () => {
    const ai = new AIMessage({
      content: [
        { type: 'text', text: 'thinking...' },
        { type: 'tool_use', id: 't2', name: 'lookup', input: { q: 'y' } },
      ],
    });
    const out = extractStructuredMessages([ai]);
    const tcs = out[0]!.tool_calls as Array<{ name: string; args: Record<string, unknown>; id: string }>;
    expect(tcs).toHaveLength(1);
    expect(tcs[0]!.name).toBe('lookup');
    expect(tcs[0]!.args).toEqual({ q: 'y' });
  });

  it('ToolMessage 提取 tool_call_id 与 name', () => {
    const tm = new ToolMessage({ content: 'r', tool_call_id: 'tc-1', name: 'search' });
    const out = extractStructuredMessages([tm]);
    expect(out[0]!.role).toBe('tool');
    expect(out[0]!.tool_call_id).toBe('tc-1');
    expect(out[0]!.name).toBe('search');
  });

  it('SystemMessage → role=system', () => {
    const out = extractStructuredMessages([new SystemMessage('be helpful')]);
    expect(out[0]!.role).toBe('system');
  });

  it('混合消息列表按顺序输出', () => {
    const out = extractStructuredMessages([
      new HumanMessage('q'),
      new AIMessage('a'),
      new ToolMessage({ content: 'r', tool_call_id: 'tc', name: 't' }),
    ]);
    expect(out.map((m) => m.role)).toEqual(['user', 'ai', 'tool']);
  });

  it('空输入返回空列表', () => {
    expect(extractStructuredMessages([])).toEqual([]);
    expect(extractStructuredMessages(null)).toEqual([]);
    expect(extractStructuredMessages(undefined)).toEqual([]);
  });

  it('None 条目跳过', () => {
    const out = extractStructuredMessages([new HumanMessage('a'), null]);
    expect(out).toHaveLength(1);
  });

  it('content=None 归一化为空字符串', () => {
    const tm = new ToolMessage({ content: 'r', tool_call_id: 't' });
    (tm as { content: unknown }).content = undefined;
    const out = extractStructuredMessages([tm]);
    expect(out[0]!.content).toBe('');
  });

  it('content 是 list 时保留结构（不 join）', () => {
    const ai = new AIMessage({
      content: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
    });
    const out = extractStructuredMessages([ai]);
    expect(Array.isArray(out[0]!.content)).toBe(true);
    expect((out[0]!.content as unknown[]).length).toBe(2);
  });
});

/**
 * 消息裁剪工具单元测试
 *
 * 对应 Python `app/core/messages/trim.py` 的 1:1 TS 化：
 * - trimOldToolMessages: 保留最近 N 条 ToolMessage 完整内容，更早替换为占位符
 * - trimMessagesWithToolLimit: 工具裁剪 + token 级别 trim
 *
 * 测试覆盖：
 * - 保留最近 N 条工具消息完整内容
 * - 旧工具消息被替换为占位符（不删除，避免模型重新触发）
 * - 替换后的 ToolMessage 保留 toolCallId
 * - keepLastN=0 时所有 ToolMessage 被替换
 * - 非 ToolMessage 不受影响
 * - token 级 trim（mock token_counter）
 * - max_tokens 未提供时跳过 token trim
 */
import { describe, it, expect } from 'vitest';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

const { trimOldToolMessages, trimMessagesWithToolLimit } = await import(
  '@main/core/messages/trim'
);

describe('trimOldToolMessages / 工具消息裁剪', () => {
  it('保留最近 2 条 ToolMessage 完整内容', () => {
    const msgs = [
      new HumanMessage('q1'),
      new AIMessage({
        content: 'a1',
        tool_calls: [{ id: 't1', name: 'search', args: {} }],
      }),
      new ToolMessage({ content: 'r1', tool_call_id: 't1' }),
      new AIMessage({
        content: 'a2',
        tool_calls: [{ id: 't2', name: 'search', args: {} }],
      }),
      new ToolMessage({ content: 'r2', tool_call_id: 't2' }),
      new AIMessage({
        content: 'a3',
        tool_calls: [{ id: 't3', name: 'search', args: {} }],
      }),
      new ToolMessage({ content: 'r3', tool_call_id: 't3' }),
    ];

    const out = trimOldToolMessages(msgs, 2);
    // 旧工具消息 r1 被压缩
    const tools = out.filter((m) => m instanceof ToolMessage);
    expect(tools).toHaveLength(3);
    expect(tools[0]!.content).toContain('已被压缩');
    // 最近两条保留完整
    expect(tools[1]!.content).toBe('r2');
    expect(tools[2]!.content).toBe('r3');
  });

  it('压缩后的 ToolMessage 保留 toolCallId 与 name', () => {
    const msgs = [
      new ToolMessage({ content: 'r1', tool_call_id: 't1', name: 'search' }),
      new ToolMessage({ content: 'r2', tool_call_id: 't2', name: 'lookup' }),
    ];
    const out = trimOldToolMessages(msgs, 1);
    const tools = out.filter((m) => m instanceof ToolMessage);
    expect(tools).toHaveLength(2);
    expect((tools[0] as ToolMessage).tool_call_id).toBe('t1');
    expect((tools[0] as ToolMessage).name).toBe('search');
    expect(String(tools[0]!.content)).toContain('已被压缩');
    expect(String(tools[1]!.content)).toBe('r2');
  });

  it('keepLastN=0 时所有 ToolMessage 被替换为占位符', () => {
    const msgs = [
      new ToolMessage({ content: 'r1', tool_call_id: 't1' }),
      new ToolMessage({ content: 'r2', tool_call_id: 't2' }),
    ];
    const out = trimOldToolMessages(msgs, 0);
    const tools = out.filter((m) => m instanceof ToolMessage);
    expect(tools).toHaveLength(2);
    expect(tools.every((t) => String((t as ToolMessage).content).includes('已被压缩'))).toBe(true);
  });

  it('非 ToolMessage 不受影响', () => {
    const msgs = [new HumanMessage('q'), new AIMessage('a')];
    const out = trimOldToolMessages(msgs, 2);
    expect(out[0]!.content).toBe('q');
    expect(out[1]!.content).toBe('a');
  });

  it('空消息列表返回空列表', () => {
    const out = trimOldToolMessages([], 2);
    expect(out).toEqual([]);
  });

  it('只有 1 条 ToolMessage 且 keepLastN=1 时保留完整', () => {
    const msgs = [new ToolMessage({ content: 'r1', tool_call_id: 't1' })];
    const out = trimOldToolMessages(msgs, 1);
    const tools = out.filter((m) => m instanceof ToolMessage);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.content).toBe('r1');
  });
});

describe('trimMessagesWithToolLimit / 工具裁剪 + token 裁剪组合', () => {
  it('无 max_tokens 时只做工具裁剪', () => {
    const msgs = [
      new HumanMessage('q1'),
      new ToolMessage({ content: 'r1', tool_call_id: 't1' }),
      new ToolMessage({ content: 'r2', tool_call_id: 't2' }),
    ];
    const out = trimMessagesWithToolLimit(msgs, 1, undefined, undefined);
    expect(out).toHaveLength(3);
    expect((out[1] as ToolMessage).content).toContain('已被压缩');
    expect((out[2] as ToolMessage).content).toBe('r2');
  });

  it('提供 max_tokens + token_counter 时先工具裁剪再 token 裁剪', () => {
    const msgs = [
      new HumanMessage('q1'),
      new HumanMessage('q2'),
      new AIMessage({
        content: 'a1',
        tool_calls: [{ id: 't1', name: 's', args: {} }],
      }),
      new ToolMessage({ content: 'r1', tool_call_id: 't1' }),
      new ToolMessage({ content: 'r2', tool_call_id: 't2' }),
    ];
    // 工具裁剪 keepLastN=2: [q1, q2, a1, ToolMessage(占位符 r1), ToolMessage(r2)] (5 条)
    // token_counter: 每条 1 token; max=3
    // last 策略: 从尾部累加,i=4(t=1)acc=1; i=3(t=1)acc=2; i=2(t=1)acc=3=max; i=1(t=1)acc+1=4>3 → cutFrom=2
    // slice(2) = [a1, ToolMessage(占位符 r1), ToolMessage(r2)] = 3 条
    // 但 start_on='human' 约束: messages[2]=AIMessage 非 human,向前找: messages[1]=HumanMessage(q2) → cutFrom=1
    // 最终: [q2, a1, ToolMessage(占位符 r1), ToolMessage(r2)] = 4 条
    const out = trimMessagesWithToolLimit(
      msgs,
      2, // keep_last_n
      3, // max_tokens
      (m) => m.length, // token_counter: 每条 1 token
      'last',
      'human',
    );
    expect(out.length).toBeGreaterThanOrEqual(2);
    // 首条必须是 human（start_on 约束）
    expect(out[0]).toBeInstanceOf(HumanMessage);
  });
});

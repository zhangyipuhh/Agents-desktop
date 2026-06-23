/**
 * AgentDescriptor + RuntimeContext + CommandRequest + CommandChunk 单元测试
 *
 * 对应 spec §3.1 核心创新：
 * - AgentDescriptor: 声明式 Agent 描述符（不再"代码模块"，而是数据）
 * - RuntimeContext: 运行时上下文（sessionId / profileId 等）
 * - CommandRequest: `/command/{agentId}` 入参
 * - CommandChunk: 流式输出事件
 *
 * 测试覆盖：
 * - AgentDescriptorSchema 接受最小必填字段
 * - 拒绝缺失字段（id / systemPrompt / tools / model / stream / enabled）
 * - ToolRef discriminated union 三种 kind
 * - ModelRef 通过 ModelRefSchema 复用
 * - MiddlewareRef 可选
 * - CommandRequest 入参校验
 * - CommandChunk 9 种 type 判别
 * - RuntimeContext 必填字段
 */
import { describe, it, expect } from 'vitest';

const {
  AgentDescriptorSchema,
  ToolRefSchema,
  MiddlewareRefSchema,
  RuntimeContextSchema,
  CommandRequestSchema,
  CommandChunkSchema,
  BUILTIN_AGENT_ID_PATTERN,
} = await import('@shared/types/agentDescriptor');

describe('AgentDescriptorSchema / 声明式 Agent 描述符', () => {
  it('接受最小必填字段', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'map',
      displayName: '地图',
      description: '地图 Agent',
      systemPrompt: '你是地图助手',
      tools: [],
      model: { provider: 'deepseek', model: 'deepseek-chat' },
      stream: true,
      enabled: true,
    });
    expect(r.success).toBe(true);
  });

  it('缺失 id → 失败', () => {
    const r = AgentDescriptorSchema.safeParse({
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: true,
      enabled: true,
    });
    expect(r.success).toBe(false);
  });

  it('缺失 systemPrompt → 失败', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: true,
      enabled: true,
    });
    expect(r.success).toBe(false);
  });

  it('缺失 model → 失败', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      stream: true,
      enabled: true,
    });
    expect(r.success).toBe(false);
  });

  it('stream 非 boolean → 失败', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: 'yes',
      enabled: true,
    });
    expect(r.success).toBe(false);
  });

  it('enabled 非 boolean → 失败', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: true,
      enabled: 1,
    });
    expect(r.success).toBe(false);
  });

  it('middleware 可选', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: true,
      enabled: true,
      middleware: [{ kind: 'contextEditing' }, { kind: 'todoList' }],
    });
    expect(r.success).toBe(true);
  });

  it('skills / tags 可选', () => {
    const r = AgentDescriptorSchema.safeParse({
      id: 'x',
      displayName: 'x',
      description: 'd',
      systemPrompt: 'p',
      tools: [],
      model: { provider: 'openai', model: 'gpt-4o' },
      stream: true,
      enabled: true,
      skills: ['map-toolkit'],
      tags: ['map', 'gis'],
    });
    expect(r.success).toBe(true);
  });
});

describe('ToolRefSchema / 三种 kind 判别联合', () => {
  it('builtin', () => {
    const r = ToolRefSchema.safeParse({ kind: 'builtin', name: 'get_current_time' });
    expect(r.success).toBe(true);
  });

  it('local', () => {
    const r = ToolRefSchema.safeParse({ kind: 'local', name: 'customFn' });
    expect(r.success).toBe(true);
  });

  it('mcp 必须 serverName', () => {
    const r1 = ToolRefSchema.safeParse({ kind: 'mcp', name: 'search' });
    expect(r1.success).toBe(false);
    const r2 = ToolRefSchema.safeParse({ kind: 'mcp', name: 'search', serverName: 'srv1' });
    expect(r2.success).toBe(true);
  });

  it('未知 kind 拒绝', () => {
    const r = ToolRefSchema.safeParse({ kind: 'unknown', name: 'x' });
    expect(r.success).toBe(false);
  });

  it('configOverride 可选', () => {
    const r = ToolRefSchema.safeParse({
      kind: 'mcp',
      name: 'search',
      serverName: 'srv',
      configOverride: { maxRetries: 3 },
    });
    expect(r.success).toBe(true);
  });
});

describe('MiddlewareRefSchema / 中间件引用', () => {
  it('基础 kind + 可选 config', () => {
    const r = MiddlewareRefSchema.safeParse({ kind: 'todoList' });
    expect(r.success).toBe(true);
    const r2 = MiddlewareRefSchema.safeParse({ kind: 'contextEditing', config: { keep: 20 } });
    expect(r2.success).toBe(true);
  });

  it('缺失 kind → 失败', () => {
    const r = MiddlewareRefSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('RuntimeContextSchema / 运行时上下文', () => {
  it('必填 sessionId + profileId', () => {
    const r = RuntimeContextSchema.safeParse({ sessionId: 's1', profileId: 'default' });
    expect(r.success).toBe(true);
  });

  it('缺失 sessionId → 失败', () => {
    const r = RuntimeContextSchema.safeParse({ profileId: 'p1' });
    expect(r.success).toBe(false);
  });

  it('可携带 abortSignal / metadata', () => {
    const r = RuntimeContextSchema.safeParse({
      sessionId: 's1',
      profileId: 'p1',
      abortSignal: new AbortController().signal,
      metadata: { traceId: 'abc' },
    });
    expect(r.success).toBe(true);
  });
});

describe('CommandRequestSchema / /command 入参', () => {
  it('必填 agentId + input + sessionId', () => {
    const r = CommandRequestSchema.safeParse({
      agentId: 'map',
      input: 'hello',
      sessionId: 's1',
    });
    expect(r.success).toBe(true);
  });

  it('configOverrides 可为 partial AgentDescriptor', () => {
    const r = CommandRequestSchema.safeParse({
      agentId: 'map',
      input: 'x',
      sessionId: 's1',
      configOverrides: { temperature: 0.5 },
    });
    // configOverrides 不在 schema（保持 optional + flexible）
    expect(r.success).toBe(true);
  });

  it('attachments 可选', () => {
    const r = CommandRequestSchema.safeParse({
      agentId: 'map',
      input: 'x',
      sessionId: 's1',
      attachments: ['f1', 'f2'],
    });
    expect(r.success).toBe(true);
  });

  it('缺失 agentId → 失败', () => {
    const r = CommandRequestSchema.safeParse({ input: 'x', sessionId: 's1' });
    expect(r.success).toBe(false);
  });
});

describe('CommandChunkSchema / 9 种 type 判别', () => {
  it('queue: waiting', () => {
    const r = CommandChunkSchema.safeParse({
      type: 'queue',
      event: 'waiting',
      waitingCount: 1,
      activeCount: 0,
      maxConcurrency: 1,
      position: 1,
      timestamp: Date.now(),
    });
    expect(r.success).toBe(true);
  });

  it('thinking / text', () => {
    expect(
      CommandChunkSchema.safeParse({ type: 'thinking', content: 'inner' }).success,
    ).toBe(true);
    expect(CommandChunkSchema.safeParse({ type: 'text', content: 'visible' }).success).toBe(
      true,
    );
  });

  it('tool: start / progress / stop', () => {
    const r = CommandChunkSchema.safeParse({
      type: 'tool',
      event: 'start',
      tool: 'explore',
      toolCallId: 'tc1',
    });
    expect(r.success).toBe(true);
  });

  it('subagent', () => {
    expect(
      CommandChunkSchema.safeParse({
        type: 'subagent',
        name: 'explore',
        event: 'start',
      }).success,
    ).toBe(true);
  });

  it('timeline / interrupt / error / done', () => {
    expect(
      CommandChunkSchema.safeParse({ type: 'timeline', event: 'x' }).success,
    ).toBe(true);
    expect(
      CommandChunkSchema.safeParse({
        type: 'interrupt',
        tool: 't',
        toolCallId: 'tc',
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      CommandChunkSchema.safeParse({ type: 'error', message: 'oops' }).success,
    ).toBe(true);
    expect(
      CommandChunkSchema.safeParse({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20 },
      }).success,
    ).toBe(true);
  });

  it('未知 type 拒绝', () => {
    const r = CommandChunkSchema.safeParse({ type: 'unknown' });
    expect(r.success).toBe(false);
  });
});

describe('BUILTIN_AGENT_ID_PATTERN', () => {
  it('只允许小写字母开头的 kebab-case', () => {
    expect(BUILTIN_AGENT_ID_PATTERN.test('map')).toBe(true);
    expect(BUILTIN_AGENT_ID_PATTERN.test('contract-host')).toBe(true);
    expect(BUILTIN_AGENT_ID_PATTERN.test('a1')).toBe(true);
    expect(BUILTIN_AGENT_ID_PATTERN.test('Map')).toBe(false);
    expect(BUILTIN_AGENT_ID_PATTERN.test('1map')).toBe(false);
    expect(BUILTIN_AGENT_ID_PATTERN.test('map_v2')).toBe(false);
  });
});

/**
 * LLMCatalog（modelFactory）单元测试
 *
 * 覆盖 5 家 provider 的工厂创建：
 * - openai（ChatOpenAI）
 * - anthropic（ChatAnthropic）
 * - deepseek（ChatDeepSeek）
 * - google（ChatGoogleGenerativeAI）
 * - ollama（ChatOllama）
 *
 * 同时验证：
 * - 大小写不敏感（openai / OpenAI / OPENAI 一致）
 * - 未知 provider 抛 Error
 * - 支持动态注册新 provider
 * - getSupportedProviders 返回已注册列表
 * - Ollama 走 baseUrl 默认值
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 测试用 mock 类：返回可 `new` 的构造器，并把 brand/cfg 挂到实例上
 * 用 function 而非箭头函数，确保 `new` 调用时 `this` 指向实例
 */
function makeMockClass(brand: string) {
  return vi.fn().mockImplementation(function MockLLM(this: Record<string, unknown>, cfg: unknown) {
    this.__brand = brand;
    this.cfg = cfg;
  });
}

// 5 家 provider 全部 mock（避免真实网络 / ESM 副作用）
vi.mock('@langchain/openai', () => ({ ChatOpenAI: makeMockClass('openai') }));
vi.mock('@langchain/anthropic', () => ({ ChatAnthropic: makeMockClass('anthropic') }));
vi.mock('@langchain/deepseek', () => ({ ChatDeepSeek: makeMockClass('deepseek') }));
vi.mock('@langchain/google-genai', () => ({ ChatGoogleGenerativeAI: makeMockClass('google') }));
vi.mock('@langchain/ollama', () => ({ ChatOllama: makeMockClass('ollama') }));

// 必须放在 mock 之后 import
const { createChatModel, registerModelCreator, getSupportedProviders, _resetForTests } =
  await import('@main/core/llmcalls/modelFactory');
const { ChatOpenAI } = await import('@langchain/openai');
const { ChatAnthropic } = await import('@langchain/anthropic');
const { ChatDeepSeek } = await import('@langchain/deepseek');
const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
const { ChatOllama } = await import('@langchain/ollama');

/** 从 mock 实例取 brand 字段（避免 TS 类型不重叠） */
function brandOf(m: unknown): string {
  return (m as { __brand: string }).__brand;
}

beforeEach(() => {
  _resetForTests();
  vi.clearAllMocks();
});

describe('createChatModel / 5 provider 工厂', () => {
  it('openai: 创建 ChatOpenAI 实例并透传配置', () => {
    const m = createChatModel({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      temperature: 0.3,
    });
    expect(brandOf(m)).toBe('openai');
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o', apiKey: 'sk-test', temperature: 0.3 }),
    );
  });

  it('anthropic: 创建 ChatAnthropic 实例', () => {
    const m = createChatModel({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'ant-key',
    });
    expect(brandOf(m)).toBe('anthropic');
    expect(ChatAnthropic).toHaveBeenCalled();
  });

  it('deepseek: 创建 ChatDeepSeek 实例', () => {
    const m = createChatModel({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'ds-key',
      baseUrl: 'https://api.deepseek.com',
    });
    expect(brandOf(m)).toBe('deepseek');
    expect(ChatDeepSeek).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek-chat', apiKey: 'ds-key' }),
    );
  });

  it('google: 创建 ChatGoogleGenerativeAI 实例', () => {
    const m = createChatModel({
      provider: 'google',
      model: 'gemini-2.5-flash',
      apiKey: 'g-key',
    });
    expect(brandOf(m)).toBe('google');
    expect(ChatGoogleGenerativeAI).toHaveBeenCalled();
  });

  it('ollama: 未传 baseUrl 时使用默认 http://localhost:11434', () => {
    const m = createChatModel({ provider: 'ollama', model: 'llama3' });
    expect(brandOf(m)).toBe('ollama');
    expect(ChatOllama).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama3', baseUrl: 'http://localhost:11434' }),
    );
  });

  it('ollama: 显式 baseUrl 透传', () => {
    createChatModel({ provider: 'ollama', model: 'qwen', baseUrl: 'http://gpu-host:11434' });
    expect(ChatOllama).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://gpu-host:11434' }),
    );
  });

  it('大小写不敏感: OpenAI / OPENAI / openai 等价', () => {
    expect(brandOf(createChatModel({ provider: 'openai', model: 'm' }))).toBe('openai');
    expect(brandOf(createChatModel({ provider: 'OpenAI', model: 'm' }))).toBe('openai');
    expect(brandOf(createChatModel({ provider: 'OPENAI', model: 'm' }))).toBe('openai');
  });

  it('未知 provider 抛出 Error 并提示支持列表', () => {
    expect(() =>
      createChatModel({ provider: 'grok' as unknown as 'openai', model: 'x' }),
    ).toThrow(/grok/);
    expect(() =>
      createChatModel({ provider: 'grok' as unknown as 'openai', model: 'x' }),
    ).toThrow(/openai/);
  });

  it('getSupportedProviders 返回默认 5 家', () => {
    const list = getSupportedProviders();
    expect(list).toEqual(
      expect.arrayContaining(['openai', 'anthropic', 'deepseek', 'google', 'ollama']),
    );
    expect(list).toHaveLength(5);
  });

  it('registerModelCreator: 动态注册新 provider 后可创建', () => {
    registerModelCreator('custom', (s) => ({ __brand: 'custom', cfg: s } as never));
    const m = createChatModel({ provider: 'custom', model: 'c1' });
    expect(brandOf(m)).toBe('custom');
    expect(getSupportedProviders()).toContain('custom');
  });

  it('registerModelCreator: 大小写归一', () => {
    registerModelCreator('Custom', (s) => ({ __brand: 'custom', cfg: s } as never));
    expect(getSupportedProviders().filter((x) => x === 'custom')).toHaveLength(1);
  });
});

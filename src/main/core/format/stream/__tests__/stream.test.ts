/**
 * 流式响应格式化策略单元测试
 *
 * 对应 Python `app/core/format/stream/{base,context,default,ollama}.py` 的 1:1 TS 化：
 * - StreamFormatStrategy 抽象基类
 * - DefaultStreamFormatStrategy（默认 Provider）
 * - OllamaStreamFormatStrategy（Ollama 特化，含 reasoning/thinking）
 * - StreamFormatContext（策略注册表 + 自动选择）
 *
 * 测试覆盖：
 * - Default: content 非空时返回 content；空时返回 None 跳过
 * - Ollama: 纯文本 → text 元素；含 reasoning_content → thinking 元素
 * - Ollama: content 为空但有 reasoning → thinking
 * - Context: 注册默认策略、按 provider 分发、fallback 到 default
 */
import { describe, it, expect } from 'vitest';

const {
  DefaultStreamFormatStrategy,
  OllamaStreamFormatStrategy,
  StreamFormatContext,
  streamFormatContext,
} = await import('@main/core/format/stream');

describe('DefaultStreamFormatStrategy / 通用 Provider 策略', () => {
  it('content 非空 → 返回 content', () => {
    const s = new DefaultStreamFormatStrategy();
    const chunk = { content: 'hello' };
    expect(s.formatContent(chunk, { provider: 'openai' })).toBe('hello');
  });

  it('content 空字符串 → 返回 null 跳过', () => {
    const s = new DefaultStreamFormatStrategy();
    expect(s.formatContent({ content: '' }, {})).toBeNull();
  });

  it('content 为 0 / false → 返回原 content', () => {
    const s = new DefaultStreamFormatStrategy();
    expect(s.formatContent({ content: 0 }, {})).toBe(0);
    expect(s.formatContent({ content: false }, {})).toBe(false);
  });

  it('无 content 属性 → 返回 str(chunk)', () => {
    const s = new DefaultStreamFormatStrategy();
    // cast: MessageChunkLike 期望对象,字符串作 fallback
    expect(s.formatContent('plain-string' as unknown as import('@main/core/format/stream').MessageChunkLike, {})).toBe('plain-string');
  });

  it('provider_name === "default"', () => {
    const s = new DefaultStreamFormatStrategy();
    expect(s.providerName).toBe('default');
  });
});

describe('OllamaStreamFormatStrategy / Ollama 策略', () => {
  it('纯文本 content + 无 reasoning → 返回 text 元素数组', () => {
    const s = new OllamaStreamFormatStrategy();
    const chunk = { content: 'hello', additional_kwargs: {} };
    const out = s.formatContent(chunk, { provider: 'ollama' });
    expect(out).toEqual([{ text: 'hello', type: 'text' }]);
  });

  it('content + reasoning_content → 返回 thinking 元素数组', () => {
    const s = new OllamaStreamFormatStrategy();
    const chunk = {
      content: 'visible',
      additional_kwargs: { reasoning_content: 'thinking text' },
    };
    const out = s.formatContent(chunk, { provider: 'ollama' });
    expect(out).toEqual([{ thinking: 'thinking text', type: 'thinking', index: 0 }]);
  });

  it('content 为空 + 有 reasoning → 返回 thinking', () => {
    const s = new OllamaStreamFormatStrategy();
    const chunk = { content: '', additional_kwargs: { reasoning_content: 'r' } };
    const out = s.formatContent(chunk, { provider: 'ollama' });
    expect(out).toEqual([{ thinking: 'r', type: 'thinking', index: 0 }]);
  });

  it('content 为空 + 无 reasoning → 返回 null 跳过', () => {
    const s = new OllamaStreamFormatStrategy();
    const chunk = { content: '', additional_kwargs: {} };
    expect(s.formatContent(chunk, { provider: 'ollama' })).toBeNull();
  });

  it('content 非空 + reasoning_content 为空 → 返回 text', () => {
    const s = new OllamaStreamFormatStrategy();
    const chunk = { content: 'v', additional_kwargs: { reasoning_content: '' } };
    expect(s.formatContent(chunk, { provider: 'ollama' })).toEqual([
      { text: 'v', type: 'text' },
    ]);
  });

  it('provider_name === "ollama"', () => {
    expect(new OllamaStreamFormatStrategy().providerName).toBe('ollama');
  });
});

describe('StreamFormatContext / 策略注册表', () => {
  it('默认注册 default + ollama', () => {
    const ctx = new StreamFormatContext();
    expect(ctx.availableProviders).toEqual(
      expect.arrayContaining(['default', 'ollama']),
    );
  });

  it('已知 provider 直接分发', () => {
    const ctx = new StreamFormatContext();
    const out = ctx.formatMessage(
      { content: 'hi', additional_kwargs: {} },
      { provider: 'ollama' },
    );
    expect(out).toEqual([{ text: 'hi', type: 'text' }]);
  });

  it('未知 provider fallback 到 default', () => {
    const ctx = new StreamFormatContext();
    const out = ctx.formatMessage({ content: 'fallback' }, { provider: 'unknown-x' });
    expect(out).toBe('fallback');
  });

  it('metadata 无 provider → 返回 null', () => {
    const ctx = new StreamFormatContext();
    expect(ctx.formatMessage({ content: 'x' }, {})).toBeNull();
  });

  it('registerStrategy 可注入新策略', () => {
    const ctx = new StreamFormatContext();
    ctx.registerStrategy({
      providerName: 'custom',
      formatContent: () => 'custom-out',
    });
    expect(ctx.getStrategy('custom')).toBeDefined();
    expect(ctx.formatMessage({}, { provider: 'custom' })).toBe('custom-out');
  });

  it('getStrategy 找不到返回 undefined', () => {
    const ctx = new StreamFormatContext();
    expect(ctx.getStrategy('nonexistent')).toBeUndefined();
  });
});

describe('默认 streamFormatContext 单例', () => {
  it('导出默认实例，至少包含 default/ollama', () => {
    expect(streamFormatContext).toBeDefined();
    expect(streamFormatContext.availableProviders).toEqual(
      expect.arrayContaining(['default', 'ollama']),
    );
  });
});

/**
 * shared/types 单元测试
 *
 * 验证 Zod schema 的接受/拒绝行为，确保 IPC 入参校验与运行时一致。
 */

import { describe, it, expect } from 'vitest';
import {
  NonEmptyStringSchema,
  TimestampSchema,
  UuidSchema,
  MessageRoleSchema,
  UiMessageSchema,
  ModelProviderSchema,
  ModelRefSchema,
} from '@shared/types';

describe('shared/types/common', () => {
  it('NonEmptyString 拒绝空字符串', () => {
    expect(NonEmptyStringSchema.safeParse('').success).toBe(false);
    expect(NonEmptyStringSchema.safeParse('a').success).toBe(true);
  });

  it('Timestamp 接受正整数与 ISO 字符串', () => {
    expect(TimestampSchema.safeParse(1234567890).success).toBe(true);
    expect(TimestampSchema.safeParse('2026-06-23T10:00:00Z').success).toBe(true);
    expect(TimestampSchema.safeParse('not-a-date').success).toBe(false);
  });

  it('Uuid 接受标准 UUID', () => {
    expect(UuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(UuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('shared/types/message', () => {
  it('MessageRole 仅接受枚举值', () => {
    expect(MessageRoleSchema.safeParse('user').success).toBe(true);
    expect(MessageRoleSchema.safeParse('unknown').success).toBe(false);
  });

  it('UiMessage 校验完整字段', () => {
    const r = UiMessageSchema.safeParse({ role: 'user', content: 'hi' });
    expect(r.success).toBe(true);
  });

  it('UiMessage 拒绝空 content', () => {
    const r = UiMessageSchema.safeParse({ role: 'user', content: '' });
    expect(r.success).toBe(false);
  });
});

describe('shared/types/llm', () => {
  it('ModelProvider 仅接受 5 家之一', () => {
    expect(ModelProviderSchema.safeParse('openai').success).toBe(true);
    expect(ModelProviderSchema.safeParse('gpt').success).toBe(false);
  });

  it('ModelRef temperature 在 0-2 范围', () => {
    expect(ModelRefSchema.safeParse({
      provider: 'openai', model: 'gpt-4o', temperature: 0.7,
    }).success).toBe(true);
    expect(ModelRefSchema.safeParse({
      provider: 'openai', model: 'gpt-4o', temperature: 3.0,
    }).success).toBe(false);
  });
});

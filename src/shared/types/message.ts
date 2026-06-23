/**
 * 共享类型：消息（Message）相关 schema
 *
 * 对应原 `feature-agent-core/app/core/messages/converter.py` 中处理的 UI / LangChain / Anthropic 消息格式。
 * Phase 1 仅定义 schema 与类型，具体转换逻辑放在 `src/main/core/messages/converter.ts`（P1.T1.6）。
 */

import { z } from 'zod';
import { NonEmptyStringSchema, TimestampSchema } from './common';

/**
 * 角色枚举
 *
 * - `user`：用户消息
 * - `assistant`：模型回复
 * - `system`：系统提示词（仅初始化时使用，运行时不应出现）
 * - `tool`：工具调用结果
 */
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * 工具调用 schema（来自 LangChain AIMessage 的 tool_calls 字段）
 *
 * Phase 1 仅定义基础结构；具体 LangChain ToolCall 类型由 messages/converter.ts 处理。
 */
export const ToolCallSchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  args: z.record(z.string(), z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * UI 消息 schema
 *
 * 对应原 Python 端 `to_langchain_messages` / `to_anthropic_params` 的入参。
 * 渲染层发送的对话历史都应通过此 schema 校验。
 */
export const UiMessageSchema = z.object({
  role: MessageRoleSchema,
  content: NonEmptyStringSchema,
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  createdAt: TimestampSchema.optional(),
});
export type UiMessage = z.infer<typeof UiMessageSchema>;

/**
 * 会话消息 schema
 *
 * 数据库层消息结构（用于 messages 表序列化）。
 * 直接展开 UiMessageSchema 的字段，绕开 Zod 4 的 `.extend()` 签名差异。
 */
export const SessionMessageSchema = z.object({
  id: z.number().int().positive().optional(),
  sessionId: NonEmptyStringSchema,
  role: MessageRoleSchema,
  content: NonEmptyStringSchema,
  toolCalls: z.array(ToolCallSchema).optional(),
  toolCallId: z.string().optional(),
  createdAt: TimestampSchema.optional(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;

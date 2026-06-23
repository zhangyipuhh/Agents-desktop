/**
 * 共享类型：LLM 模型引用 schema
 *
 * 对应原 `feature-agent-core/app/core/llmcalls/model_factory.py` 中的 5 家 provider。
 * 同时作为 `AgentDescriptor.model` 字段（spec §3.1）。
 */

import { z } from 'zod';

/**
 * 模型 provider 枚举
 *
 * 与 `@langchain/openai` / `@langchain/anthropic` / `@langchain/deepseek` /
 * `@langchain/google-genai` / `@langchain/ollama` 一一对应。
 */
export const ModelProviderSchema = z.enum(['openai', 'anthropic', 'deepseek', 'google', 'ollama']);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

/**
 * 模型引用 schema
 *
 * `apiKey` 字段允许直接传 key（来自设置或 env 注入）；
 * 推荐生产用 `apiKeyEnv` 间接从 `process.env[envVar]` 读取，避免 key 落盘。
 */
export const ModelRefSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  apiKey: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  baseUrl: z.string().url().optional(),
});
export type ModelRef = z.infer<typeof ModelRefSchema>;

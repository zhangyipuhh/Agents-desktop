/**
 * LLMCatalog —— 5 家 LLM provider 的统一工厂
 *
 * 设计目标：
 * 1. 单一入口 `createChatModel({ provider, model, apiKey?, baseUrl?, temperature?, maxTokens? })`
 * 2. 支持动态注册新 provider（`registerModelCreator`），无需改本文件
 * 3. 大小写不敏感（OpenAI / openai / OPENAI 等价）
 * 4. 未知 provider 抛 Error，错误信息包含已支持列表
 *
 * Provider → LangChain 类映射：
 * - openai    → ChatOpenAI
 * - anthropic → ChatAnthropic
 * - deepseek  → ChatDeepSeek
 * - google    → ChatGoogleGenerativeAI
 * - ollama    → ChatOllama（缺省 baseUrl = http://localhost:11434）
 */
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/** 支持的 provider 字面量（Zod schema 后续在 AgentDescriptor.ts 单独建） */
export type ModelProvider = 'openai' | 'anthropic' | 'deepseek' | 'google' | 'ollama';

/** 工厂入参：与 AgentDescriptor.model 字段保持一致 */
export interface ModelSpec {
  provider: ModelProvider | string;
  /** 模型名，如 'gpt-4o' / 'deepseek-chat' / 'llama3' */
  model: string;
  /** API 密钥；本地 ollama 可为空 */
  apiKey?: string;
  /** 自定义 baseUrl（兼容 API / 代理 / 私有部署）；ollama 默认 http://localhost:11434 */
  baseUrl?: string;
  /** 温度参数 0-1；默认 0 */
  temperature?: number;
  /** 最大生成 token 数（部分 provider 支持） */
  maxTokens?: number;
}

/** 创建函数签名：可被外部 `registerModelCreator` 注入 */
export type ModelCreator = (spec: ModelSpec) => BaseChatModel;

/** 默认 5 家 provider 创建器。拆为函数便于 `_resetForTests` 复用 */
const DEFAULT_CREATORS: Record<string, ModelCreator> = {
  openai: (s) =>
    new ChatOpenAI({
      model: s.model,
      apiKey: s.apiKey,
      temperature: s.temperature,
      maxTokens: s.maxTokens,
      ...(s.baseUrl ? { configuration: { baseURL: s.baseUrl } } : {}),
    }),

  anthropic: (s) =>
    new ChatAnthropic({
      model: s.model,
      apiKey: s.apiKey,
      temperature: s.temperature,
      maxTokens: s.maxTokens,
      ...(s.baseUrl ? { clientOptions: { baseURL: s.baseUrl } } : {}),
    } as never) as unknown as BaseChatModel,

  deepseek: (s) =>
    new ChatDeepSeek({
      model: s.model,
      apiKey: s.apiKey,
      temperature: s.temperature,
      maxTokens: s.maxTokens,
      ...(s.baseUrl ? { configuration: { baseURL: s.baseUrl } } : {}),
    }),

  google: (s) =>
    new ChatGoogleGenerativeAI({
      model: s.model,
      apiKey: s.apiKey,
      temperature: s.temperature,
      maxOutputTokens: s.maxTokens,
    }),

  ollama: (s) =>
    new ChatOllama({
      model: s.model,
      baseUrl: s.baseUrl ?? 'http://localhost:11434',
      temperature: s.temperature,
    }),
};

/** 类级注册表：所有实例/外部注册都写到这张表 */
const modelCreators: Record<string, ModelCreator> = { ...DEFAULT_CREATORS };

/**
 * 创建 LLM 实例。
 *
 * @param spec 模型规格（provider / model / 可选 apiKey/baseUrl/temperature/maxTokens）
 * @returns 对应 provider 的 `BaseChatModel` 实例
 * @throws Error 当 `provider` 未注册时；错误消息含已支持列表
 *
 * @example
 *   const m = createChatModel({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-xxx' });
 */
export function createChatModel(spec: ModelSpec): BaseChatModel {
  const key = String(spec.provider).toLowerCase();
  const creator = modelCreators[key];
  if (!creator) {
    const supported = Object.keys(modelCreators).join(', ');
    throw new Error(`不支持的模型类型: ${spec.provider}. 支持的模型类型: ${supported}`);
  }
  return creator(spec);
}

/**
 * 动态注册 provider 创建器。
 *
 * @param provider provider 名（大小写归一为小写）
 * @param creator 创建函数，签名为 `(spec: ModelSpec) => BaseChatModel`
 *
 * @example
 *   registerModelCreator('azure', (s) => new ChatOpenAI({ ... }));
 */
export function registerModelCreator(provider: string, creator: ModelCreator): void {
  modelCreators[provider.toLowerCase()] = creator;
}

/**
 * 返回当前已注册 provider 列表（拷贝）。
 *
 * @returns provider 名数组（小写）
 */
export function getSupportedProviders(): string[] {
  return Object.keys(modelCreators);
}

/**
 * 测试专用：重置注册表到默认 5 家。仅供 vitest `beforeEach` 使用。
 * @internal
 */
export function _resetForTests(): void {
  for (const k of Object.keys(modelCreators)) delete modelCreators[k];
  Object.assign(modelCreators, DEFAULT_CREATORS);
}

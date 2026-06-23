/**
 * 流式响应格式化策略抽象基类
 *
 * 1:1 翻译自 `app/core/format/stream/base.py`。
 *
 * 所有具体的 Provider 格式化策略都需要继承此类（或实现同名接口）。
 *
 * 设计原则：
 * - formatContent 返回 `null` 表示"该 chunk 应跳过"（不向下游发送）
 * - providerName 用于在 StreamFormatContext 中查表
 */

/** 消息块：duck typing，避免强依赖 LangChain 类型 */
export interface MessageChunkLike {
  content?: string | unknown;
  additional_kwargs?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 元数据：包含 provider 信息等 */
export interface FormatMetadata {
  provider?: string;
  [key: string]: unknown;
}

/**
 * 格式化后的内容
 * - string：纯文本
 * - Array<{ type, text?, thinking?, index? }>：结构化元素（用于 thinking/text 区分）
 * - null：跳过本 chunk
 */
export type FormattedContent = string | Array<Record<string, unknown>> | null;

/**
 * 流式格式化策略接口
 */
export interface StreamFormatStrategy {
  /** Provider 名称（用于查表） */
  readonly providerName: string;

  /**
   * 格式化消息块
   *
   * @param messageChunk LangChain 风格消息块（duck typing）
   * @param metadata 元数据（含 `provider` 等）
   * @returns 格式化后内容；返回 `null` 表示应跳过
   */
  formatContent(messageChunk: MessageChunkLike, metadata: FormatMetadata): FormattedContent;
}

/**
 * 流式响应格式化策略上下文
 *
 * 管理不同的格式化策略并根据 provider 自动选择合适的策略。
 *
 * 1:1 翻译自 `app/core/format/stream/context.py`。
 */
import type {
  FormattedContent,
  FormatMetadata,
  MessageChunkLike,
  StreamFormatStrategy,
} from './Base';
import { DefaultStreamFormatStrategy } from './Default';
import { OllamaStreamFormatStrategy } from './Ollama';

/**
 * 流式格式化策略上下文管理器
 *
 * 职责：
 * - 注册/管理不同的策略
 * - 根据 `metadata.provider` 自动选择策略
 * - 未知 provider 自动 fallback 到 default
 * - 提供统一的 `formatMessage` 接口
 */
export class StreamFormatContext {
  private strategies: Map<string, StreamFormatStrategy> = new Map();

  constructor() {
    this._registerDefaultStrategies();
  }

  private _registerDefaultStrategies(): void {
    this.registerStrategy(new OllamaStreamFormatStrategy());
    this.registerStrategy(new DefaultStreamFormatStrategy());
  }

  /** 注册新策略 */
  registerStrategy(strategy: StreamFormatStrategy): void {
    this.strategies.set(strategy.providerName, strategy);
  }

  /** 获取指定 Provider 的策略；找不到返回 undefined */
  getStrategy(providerName: string): StreamFormatStrategy | undefined {
    return this.strategies.get(providerName);
  }

  /**
   * 使用合适的策略格式化消息
   *
   * @param messageChunk 消息块
   * @param metadata 元数据（含 `provider` 字段）
   * @returns 格式化后的内容；如果应跳过则返回 null
   */
  formatMessage(
    messageChunk: MessageChunkLike,
    metadata: FormatMetadata,
  ): FormattedContent {
    const providerName = metadata.provider;
    if (!providerName) return null;

    let strategy = this.getStrategy(providerName);
    if (!strategy) {
      strategy = this.getStrategy('default');
    }
    if (!strategy) return null;

    return strategy.formatContent(messageChunk, metadata);
  }

  /** 所有已注册的 provider 名称 */
  get availableProviders(): string[] {
    return Array.from(this.strategies.keys());
  }
}

/** 默认单例：与 Python 版 `stream_format_context = StreamFormatContext()` 对齐 */
export const streamFormatContext = new StreamFormatContext();

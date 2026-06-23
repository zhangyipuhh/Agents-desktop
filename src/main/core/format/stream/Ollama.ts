/**
 * Ollama Provider 流式响应格式化策略
 *
 * 实现 Ollama 的特定输出格式处理：
 * - 检查 content 是否为空
 * - 处理 reasoning_content (thinking) 的逻辑
 * - 返回统一格式（text / thinking 结构化元素）
 *
 * 1:1 翻译自 `app/core/format/stream/ollama.py`。
 */
import type {
  FormattedContent,
  FormatMetadata,
  MessageChunkLike,
  StreamFormatStrategy,
} from './Base';

/** Ollama reasoning_content 字段 */
type ReasoningContent = { reasoning_content?: string };

/**
 * Ollama 流式格式化策略
 */
export class OllamaStreamFormatStrategy implements StreamFormatStrategy {
  get providerName(): string {
    return 'ollama';
  }

  /**
   * 格式化 Ollama 消息内容
   *
   * 处理逻辑：
   * 1. content 非空：
   *    - 若 reasoning_content 存在且非空 → 返回 thinking 元素
   *    - 否则 → 返回 text 元素
   * 2. content 为空：
   *    - 若 reasoning_content 存在且非空 → 返回 thinking 元素
   * 3. 都没有 → 返回 null 跳过
   */
  formatContent(messageChunk: MessageChunkLike, _metadata: FormatMetadata): FormattedContent {
    const content = readContent(messageChunk);
    const reasoningContent = readReasoningContent(messageChunk);

    if (content !== '' && content !== undefined && content !== null) {
      // content 非空
      if (reasoningContent && reasoningContent.reasoning_content) {
        return [{ thinking: reasoningContent.reasoning_content, type: 'thinking', index: 0 }];
      }
      return [{ text: content as string, type: 'text' }];
    }

    // content 为空 — 检查 reasoning
    if (reasoningContent && reasoningContent.reasoning_content) {
      return [{ thinking: reasoningContent.reasoning_content, type: 'thinking', index: 0 }];
    }

    return null;
  }
}

function readContent(chunk: MessageChunkLike): unknown {
  if (chunk && typeof chunk === 'object' && 'content' in chunk) {
    return chunk.content;
  }
  return '';
}

function readReasoningContent(chunk: MessageChunkLike): ReasoningContent | null {
  if (chunk && typeof chunk === 'object' && 'additional_kwargs' in chunk) {
    const ak = chunk.additional_kwargs;
    if (ak && typeof ak === 'object') {
      return ak as ReasoningContent;
    }
  }
  return null;
}

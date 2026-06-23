/**
 * 通用 Provider 流式响应格式化策略
 *
 * 处理非 Ollama 的默认格式化逻辑。
 * - 直接返回 message_chunk 的 content
 * - 如果 content 为空字符串，返回 null 跳过
 *
 * 1:1 翻译自 `app/core/format/stream/default.py`。
 */
import type {
  FormattedContent,
  FormatMetadata,
  MessageChunkLike,
  StreamFormatStrategy,
} from './Base';

/**
 * 通用 Provider 流式格式化策略
 */
export class DefaultStreamFormatStrategy implements StreamFormatStrategy {
  get providerName(): string {
    return 'default';
  }

  /**
   * 格式化通用消息内容
   *
   * 处理逻辑：
   * 1. 获取 message_chunk 的 content（无 content 属性则 `str(chunk)`）
   * 2. content 非空字符串 → 返回 content
   * 3. content 是空字符串 → 返回 null 跳过
   * 4. 其他类型（数字、false 等）→ 原样返回（非空）
   *
   * @param messageChunk 消息块
   * @param metadata 元数据
   * @returns 消息内容或 null
   */
  formatContent(messageChunk: MessageChunkLike, _metadata: FormatMetadata): FormattedContent {
    let content: unknown;
    if (messageChunk && typeof messageChunk === 'object' && 'content' in messageChunk) {
      content = messageChunk.content;
    } else {
      content = String(messageChunk);
    }
    if (content === '' || content === undefined || content === null) {
      return null;
    }
    return content as FormattedContent;
  }
}

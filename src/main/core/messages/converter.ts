/**
 * 消息内容转换器
 *
 * 1:1 翻译自 `app/core/messages/converter.py`。
 *
 * 职责：统一处理不同模型返回的 content 格式，输出字符串。
 * 主要用于非流式输出场景，统一处理以下特殊输出格式：
 * - 普通字符串：直接返回
 * - 列表（MiniMax thinking 模式）：按 type 提取 text/thinking/image_url/tool_use/tool_result
 *
 * 核心能力：
 * 1. 兼容不同模型返回的 content 结构差异
 * 2. 提取纯文本内容用于显示
 * 3. 支持 thinking 内容的过滤与包含
 * 4. 处理工具调用、工具结果等特殊内容类型
 */

/** content 元素：来自 LangChain 列表式 content */
export interface ContentItem {
  type?: string;
  text?: string;
  thinking?: string;
  /** tool_use */
  name?: string;
  input?: unknown;
  /** tool_result */
  content?: unknown;
}

/** LangChain 风格的 BaseMessage（duck typing，避免强依赖） */
export interface BaseMessageLike {
  content?: string | ContentItem[];
  [key: string]: unknown;
}

/**
 * 转换工具：把字符串/列表 content 转为单字符串
 *
 * @param content 字符串 / ContentItem 列表 / 其他类型
 * @param include_thinking 是否包含 thinking（默认 false，仅返回 text）
 * @param thinking_prefix thinking 内容前缀，默认 `"[思考]: "`
 * @returns 单字符串（多段以 `\n` 连接）
 *
 * @example
 *   toString([{ type:'thinking', thinking:'i' }, { type:'text', text:'o' }], true)
 *   // → "[思考]: i\no"
 */
export function toString(
  content: string | ContentItem[] | unknown,
  includeThinking = false,
  thinkingPrefix = '[思考]: ',
): string {
  // 字符串：原样返回
  if (typeof content === 'string') return content;

  // 列表：按 type 分发
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      // 元素本身就是字符串
      if (typeof item === 'string') {
        parts.push(item);
        continue;
      }
      // 对象：按 type 分发
      if (item && typeof item === 'object') {
        const it = item as ContentItem;
        switch (it.type) {
          case 'text':
            parts.push(it.text ?? '');
            break;
          case 'thinking':
            if (includeThinking) {
              const t = it.thinking ?? '';
              if (t) parts.push(`${thinkingPrefix}${t}`);
            }
            break;
          case 'image_url':
            parts.push('[图片]');
            break;
          case 'tool_use': {
            const n = it.name ?? 'unknown_tool';
            parts.push(`[工具调用]: ${n}(${JSON.stringify(it.input ?? {})})`);
            break;
          }
          case 'tool_result':
            parts.push(`[工具结果]: ${it.content ?? ''}`);
            break;
          default:
            // 兜底：取 text → content
            if ('text' in it) parts.push(String((it as { text: unknown }).text ?? ''));
            else if ('content' in it)
              parts.push(String((it as { content: unknown }).content ?? ''));
            break;
        }
      }
    }
    return parts.join('\n');
  }

  // 其他类型（数字、对象等）→ str()
  return String(content);
}

/**
 * 只提取 text 类型内容，忽略 thinking
 * @param content 字符串 / 列表 / 其他
 * @returns 纯文本
 */
export function extractText(content: string | ContentItem[] | unknown): string {
  return toString(content, false);
}

/**
 * 提取完整内容，包含 thinking
 * @param content 字符串 / 列表 / 其他
 * @returns 含 thinking 的完整文本
 */
export function extractFull(content: string | ContentItem[] | unknown): string {
  return toString(content, true);
}

/**
 * 命名空间：与 Python `MessageContentConverter` 类 API 对齐
 */
export const MessageContentConverter = {
  toString,
  to_string: toString,
  extractText,
  extract_text: extractText,
  extractFull,
  extract_full: extractFull,
} as const;

/**
 * 从 BaseMessage 提取文本内容
 *
 * @param message LangChain 风格消息对象（duck typing）
 * @param includeThinking 是否包含 thinking
 * @returns 文本
 */
export function extractMessageContent(
  message: BaseMessageLike | unknown,
  includeThinking = false,
): string {
  const m = message as BaseMessageLike | undefined;
  const content = m && 'content' in (m as object) ? m.content : String(message);
  return toString(content, includeThinking);
}

/** 顶层 `extract_text(message)` —— 便捷函数 */
export function extractTextMessage(message: BaseMessageLike | unknown): string {
  const m = message as BaseMessageLike | undefined;
  const content = m && 'content' in (m as object) ? m.content : String(message);
  return toString(content, false);
}

/** 顶层 `extract_full(message)` —— 便捷函数 */
export function extractFullMessage(message: BaseMessageLike | unknown): string {
  const m = message as BaseMessageLike | undefined;
  const content = m && 'content' in (m as object) ? m.content : String(message);
  return toString(content, true);
}

// 别名导出以兼容 Python 顶层函数命名
export const extract_text = extractTextMessage;
export const extract_full = extractFullMessage;

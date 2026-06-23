/**
 * subagent_message_extractor - 子智能体消息结构化提取器
 *
 * 1:1 翻译自 `app/core/tools/subagent_message_extractor.py`。
 *
 * 将 LangChain BaseMessage 列表转换为前端可消费的结构化 dict 列表。
 * 为后端 subagent 工具（sandbox / explore）的事件填充
 * `child_messages` / `final_messages` 字段。
 *
 * 设计目标：
 * 1. 与 SandboxTools._extract_ai_tool_calls 兼容（OpenAI/Anthropic 两种风格）
 * 2. 测试环境使用 Mock 对象时通过 `type(msg).__name__` 兼容判断
 * 3. content 字段保留原始结构（str / list[ContentBlock]），不强行 stringify
 * 4. 失败消息（无 type / 异常）降级为 `{type: "Unknown", content: str(msg)}`
 */

/** 兼容 Mock 对象的类型名集合 */
const HUMAN_TYPE_NAMES = new Set(['HumanMessage', 'MockHumanMessage', '_MockHumanMessage']);
const AI_TYPE_NAMES = new Set([
  'AIMessage',
  'MockAIMessage',
  '_MockAIMessage',
  'AIMessageChunk',
]);
const TOOL_TYPE_NAMES = new Set([
  'ToolMessage',
  'MockToolMessage',
  '_MockToolMessage',
]);
const SYSTEM_TYPE_NAMES = new Set([
  'SystemMessage',
  'MockSystemMessage',
  '_MockSystemMessage',
]);

/** 角色分类 */
export type MessageRole = 'user' | 'ai' | 'tool' | 'system' | 'unknown';

/**
 * 工具调用项（统一结构）
 */
export interface StructuredToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string | null;
}

/** 单条结构化消息 */
export interface StructuredMessage {
  type: string;
  role: MessageRole;
  /** 原样保留：str / list[ContentBlock] / dict */
  content: string | Array<Record<string, unknown>> | Record<string, unknown>;
  tool_calls?: StructuredToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * 根据消息类型名返回角色字符串
 * @param typeName 消息对象的类名（兼容 Mock 后缀）
 * @returns 角色字符串
 */
function classifyRole(typeName: string): MessageRole {
  if (HUMAN_TYPE_NAMES.has(typeName)) return 'user';
  if (AI_TYPE_NAMES.has(typeName)) return 'ai';
  if (TOOL_TYPE_NAMES.has(typeName)) return 'tool';
  if (SYSTEM_TYPE_NAMES.has(typeName)) return 'system';
  return 'unknown';
}

/**
 * 归一化消息 content 字段
 * - str / list / dict 原样返回
 * - None → ""
 * - 其他 → str()
 */
function normalizeContent(content: unknown): StructuredMessage['content'] {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content as Array<Record<string, unknown>>;
  if (typeof content === 'object') return content as Record<string, unknown>;
  return String(content);
}

/**
 * 从 AIMessage 派生对象提取 LLM 决策的工具调用列表
 *
 * 兼容三种来源：
 * 1. OpenAI 风格：`msg.tool_calls` 字段
 * 2. Anthropic 风格：`msg.content` 是 list，其中 type='tool_use' 块
 * 3. langchain-core 1.x：`msg.content_blocks` 中 type='tool_call'/'non_standard' 块
 *
 * @param msg AIMessage 或其派生对象
 * @returns 统一为 `{name, args, id}` 的工具调用列表
 */
function extractToolCallsFromAi(msg: unknown): StructuredToolCall[] {
  const results: StructuredToolCall[] = [];
  if (!msg || typeof msg !== 'object') return results;

  // 1) OpenAI 风格：msg.tool_calls
  const toolCalls = (msg as { tool_calls?: unknown }).tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (tc && typeof tc === 'object') {
        const name = (tc as { name?: unknown }).name;
        const args = (tc as { args?: unknown }).args;
        const id = (tc as { id?: unknown }).id;
        results.push({
          name: typeof name === 'string' ? name : '',
          args:
            args && typeof args === 'object' && !Array.isArray(args)
              ? (args as Record<string, unknown>)
              : {},
          id: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
        });
      }
    }
  }

  // 2) Anthropic 风格：msg.content 是 list
  const content = (msg as { content?: unknown }).content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object') {
        const b = block as { type?: string; name?: unknown; input?: unknown; id?: unknown };
        if (b.type === 'tool_use') {
          const args = b.input;
          results.push({
            name: typeof b.name === 'string' ? b.name : '',
            args:
              args && typeof args === 'object' && !Array.isArray(args)
                ? (args as Record<string, unknown>)
                : {},
            id: typeof b.id === 'string' ? b.id : null,
          });
        }
      }
    }
  }

  // 3) langchain-core 1.x content_blocks
  const contentBlocks = (msg as { content_blocks?: unknown }).content_blocks;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      if (!block || typeof block !== 'object') continue;
      const b = block as {
        type?: string;
        name?: unknown;
        args?: unknown;
        id?: unknown;
        value?: unknown;
      };
      if (b.type === 'tool_call') {
        const args = b.args;
        results.push({
          name: typeof b.name === 'string' ? b.name : '',
          args:
            args && typeof args === 'object' && !Array.isArray(args)
              ? (args as Record<string, unknown>)
              : {},
          id: typeof b.id === 'string' ? b.id : null,
        });
      } else if (b.type === 'non_standard') {
        const value = b.value;
        if (value && typeof value === 'object') {
          const v = value as { type?: string; name?: unknown; input?: unknown; id?: unknown };
          if (v.type === 'tool_use') {
            const args = v.input;
            results.push({
              name: typeof v.name === 'string' ? v.name : '',
              args:
                args && typeof args === 'object' && !Array.isArray(args)
                  ? (args as Record<string, unknown>)
                  : {},
              id: typeof v.id === 'string' ? v.id : null,
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * 把单个消息对象转为结构化 dict
 *
 * @param msg LangChain BaseMessage 或其 Mock 对象
 * @returns 结构化消息
 */
function extractMessage(msg: unknown): StructuredMessage {
  const typeName = msg && typeof msg === 'object' ? msg.constructor?.name ?? 'Unknown' : 'Unknown';
  const role = classifyRole(typeName);
  const m = msg as { content?: unknown; tool_call_id?: unknown; name?: unknown };
  const result: StructuredMessage = {
    type: typeName,
    role,
    content: normalizeContent(m.content),
  };

  if (role === 'ai') {
    const tcs = extractToolCallsFromAi(msg);
    if (tcs.length > 0) result.tool_calls = tcs;
  }

  if (role === 'tool') {
    if (m.tool_call_id !== undefined && m.tool_call_id !== null) {
      result.tool_call_id = String(m.tool_call_id);
    }
    if (typeof m.name === 'string' && m.name) {
      result.name = m.name;
    }
  }

  return result;
}

/**
 * 把 LangChain BaseMessage 列表转换为前端可消费的结构化 dict 列表
 *
 * @param messages 任意含 LangChain BaseMessage 派生对象的可迭代对象
 * @returns 每项为 `{type, role, content, tool_calls?, tool_call_id?, name?}`
 *          异常输入（None/空/非可迭代）返回空列表
 *          单条解析失败降级为 Unknown 条目，不影响其他消息
 */
export function extractStructuredMessages(
  messages: Iterable<unknown> | null | undefined,
): StructuredMessage[] {
  if (!messages) return [];

  const result: StructuredMessage[] = [];
  for (const msg of messages) {
    if (msg === null || msg === undefined) continue;
    try {
      result.push(extractMessage(msg));
    } catch {
      // 单条消息解析失败时降级为 Unknown 条目，不影响其他消息
      try {
        result.push({
          type: 'Unknown',
          role: 'unknown',
          content: String(msg),
        });
      } catch {
        // str(msg) 仍失败时彻底跳过
      }
    }
  }
  return result;
}

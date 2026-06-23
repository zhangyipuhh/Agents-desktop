/**
 * 消息裁剪工具
 *
 * 1:1 翻译自 `app/core/messages/trim.py`。
 *
 * 核心动机：
 * - Agent 在长对话中会累积大量 ToolMessage，挤占上下文窗口
 * - 直接删除旧 ToolMessage 会导致模型看到 tool_calls 却找不到对应 ToolMessage，
 *   从而**重新触发工具调用**（浪费 token）
 * - 本模块把"旧 ToolMessage"保留为占位符（保留 tool_call_id 与 name），
 *   切断这个回路。
 *
 * 与 LangChain ContextEditingMiddleware 的 ClearToolUsesEdit 思路一致，
 * 但不依赖中间件机制，直接在消息列表层面操作。
 *
 * 注意：LangChain 1.x 不再导出 `trim_messages`（v0.3 弃用，1.x 删除）。
 * 本模块自实现一个简化版 token-level trim，行为对齐 LangChain 原语义：
 * - strategy='last'：从头部丢弃，保留尾部；剩余总 token ≤ max_tokens
 * - strategy='first'：从尾部丢弃，保留头部
 * - start_on：裁剪结果首条必须是该角色
 */
import { ToolMessage, type BaseMessage } from '@langchain/core/messages';

/** 占位符文案：旧工具消息被替换后的内容 */
export const TRIMMED_PLACEHOLDER =
  '[历史工具调用结果已被压缩，如需查看完整结果请重新执行该工具]';

/**
 * 用 WeakMap 给消息对象一个稳定 id（避免 JS 内置 id 受 GC 影响）
 */
const idMap = new WeakMap<object, number>();
let nextId = 0;
function getMsgId(obj: object): number {
  let id = idMap.get(obj);
  if (id === undefined) {
    id = ++nextId;
    idMap.set(obj, id);
  }
  return id;
}

/**
 * 把"旧 ToolMessage"压缩为占位符；最近 N 条保留完整。
 *
 * 行为契约：
 * 1. 找出所有 ToolMessage，保留最近 `keep_last_n` 条完整内容
 * 2. 更早的 ToolMessage 替换为占位符（保留 tool_call_id 与 name）
 * 3. 非 ToolMessage 不受影响，原样保留
 *
 * @param messages 消息列表（任意 BaseMessage 子类）
 * @param keepLastN 保留最近几条 ToolMessage 完整内容，默认 2
 * @returns 处理后的消息列表（**新数组**，原列表不变）
 */
export function trimOldToolMessages<M extends BaseMessage>(
  messages: M[],
  keepLastN = 2,
): M[] {
  // 收集所有 ToolMessage 引用（用对象身份 id 标识）
  const toolMessages: ToolMessage[] = [];
  for (const m of messages) {
    if (m instanceof ToolMessage) toolMessages.push(m);
  }

  // 最近 N 条保留完整
  const keepCount = Math.min(keepLastN, toolMessages.length);
  const keepIds = new Set<number>();
  if (keepCount > 0) {
    for (const tm of toolMessages.slice(-keepCount)) keepIds.add(getMsgId(tm));
  }

  // 构造结果
  const result: M[] = [];
  for (const msg of messages) {
    if (msg instanceof ToolMessage) {
      if (keepIds.has(getMsgId(msg))) {
        result.push(msg);
      } else {
        // 用占位符替换；保留 toolCallId/name 以避免模型重新触发
        const trimmed = new ToolMessage({
          content: TRIMMED_PLACEHOLDER,
          tool_call_id: msg.tool_call_id,
          name: (msg as unknown as { name?: string }).name,
        });
        result.push(trimmed as unknown as M);
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}

/** token 裁剪策略 */
export type TrimStrategy = 'last' | 'first';

/** start_on 锚点角色（裁剪结果的首条必须是该角色） */
export type TrimStartOn = 'human' | 'system' | 'ai' | 'tool';

/** 判断消息是否匹配 start_on 角色（duck typing on constructor name） */
function matchesStartOn(msg: BaseMessage, startOn: TrimStartOn): boolean {
  const cls = msg.constructor.name.toLowerCase();
  switch (startOn) {
    case 'human':
      return cls.includes('human');
    case 'system':
      return cls.includes('system');
    case 'ai':
      return cls.includes('ai') || cls.includes('assistant');
    case 'tool':
      return cls.includes('tool');
  }
}

/**
 * 简化版 token-level trim（对齐 LangChain 原 `trim_messages` 语义）
 *
 * 行为：
 * - `strategy='last'`：**从头部丢弃**消息直到总 token ≤ max_tokens；剩余首条必须是 start_on
 * - `strategy='first'`：**从尾部丢弃**消息直到总 token ≤ max_tokens
 * - `start_on`：裁剪结果的首条必须是 start_on 角色（向前找最近的 start_on 作为起点）
 *
 * 不依赖 LangChain 的 trim_messages（v1.x 已移除）。
 *
 * @param messages 消息列表
 * @param maxTokens token 上限
 * @param tokenCounter token 计算函数（同步）
 * @param strategy 'last' | 'first'
 * @param startOn 锚点角色
 * @returns 裁剪后的消息列表
 */
export function trimMessagesByTokens<M extends BaseMessage>(
  messages: M[],
  maxTokens: number,
  tokenCounter: (msgs: BaseMessage[]) => number,
  strategy: TrimStrategy = 'last',
  startOn: TrimStartOn = 'human',
): M[] {
  if (messages.length === 0) return messages;
  if (maxTokens <= 0) return [];

  const totalTokens = tokenCounter(messages);
  if (totalTokens <= maxTokens) return messages;

  if (strategy === 'last') {
    // 从头部丢弃：累加从尾部向前,直到总 token ≤ max_tokens
    let acc = 0;
    let cutFrom = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      const t = tokenCounter([messages[i]!]);
      if (acc + t > maxTokens) {
        cutFrom = i + 1;
        break;
      }
      acc += t;
    }
    // start_on 约束：剩余首条必须是 start_on 角色；否则向前回退到最近的 start_on
    if (cutFrom < messages.length && !matchesStartOn(messages[cutFrom]!, startOn)) {
      let foundIdx = -1;
      for (let i = cutFrom - 1; i >= 0; i--) {
        if (matchesStartOn(messages[i]!, startOn)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx >= 0) cutFrom = foundIdx;
    }
    return messages.slice(cutFrom);
  }

  // strategy === 'first'：从尾部丢弃
  let acc = 0;
  let cutTo = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = tokenCounter([messages[i]!]);
    if (acc + t > maxTokens) {
      cutTo = i;
      break;
    }
    acc += t;
  }
  return messages.slice(0, cutTo);
}

/**
 * 工具裁剪 + token 裁剪的组合
 *
 * @param messages 消息列表
 * @param keepLastN 保留最近几条 ToolMessage，默认 2
 * @param maxTokens token 上限（可选；不传则跳过 token trim）
 * @param tokenCounter token 计算函数（可选；不传则跳过 token trim）
 * @param strategy token 裁剪策略，默认 `'last'`
 * @param startOn token 裁剪起点角色，默认 `'human'`
 * @returns 处理后的消息列表
 */
export function trimMessagesWithToolLimit<M extends BaseMessage>(
  messages: M[],
  keepLastN = 2,
  maxTokens?: number,
  tokenCounter?: (msgs: BaseMessage[]) => number,
  strategy: TrimStrategy = 'last',
  startOn: TrimStartOn = 'human',
): M[] {
  let out = trimOldToolMessages(messages, keepLastN);

  if (maxTokens && tokenCounter) {
    out = trimMessagesByTokens(out, maxTokens, tokenCounter, strategy, startOn);
  }

  return out;
}

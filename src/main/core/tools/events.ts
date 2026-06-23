/**
 * Subagent 工具事件（ToolEvent）
 *
 * 1:1 翻译自 `app/core/tools/events.py`。
 *
 * 用于 subagent 工具（sandbox / explore / query_knowledge 等）向前端
 * （SSE / 历史消息接口）推送结构化事件。
 *
 * 字段说明：
 * - type: 事件类型（4 种）
 * - tool: 工具名
 * - tool_call_id: 父 LLM 调用本工具的 tool_call_id（即子 agent 的 thread_id）
 * - timestamp: 事件时间戳（秒，浮点）
 * - data: 业务字段，详见上方 JSDoc
 *
 * data 字段约定（2026-06-13 扩展，向后兼容）：
 * - args: dict，工具入参（tool_start / tool_error）
 * - workspace / root_path: str，工作目录（tool_start）
 * - description: str，人可读描述（tool_start）
 * - child_stream: dict，子 agent 的 updates 流（tool_progress，向后兼容保留）
 * - message: str，进度文本（tool_progress）
 * - status: str，"success" / "failure" / "stopped_by_user"（tool_stop / tool_error）
 * - result / final_summary / sandbox_*: 业务字段（按工具不同）
 * - duration_ms: int，工具执行耗时（tool_stop / tool_error）
 * - error_type / error_message: 错误信息（tool_error）
 * - thread_id: str，== tool_call_id，便于前端按 id 维护 subagent 列表
 * - parent_prompt: str，父 agent 传给子 agent 的 prompt（tool_start）
 * - child_messages: list[dict]，子 agent 当前累积的全部 messages，结构化
 * - final_messages: list[dict]，tool_stop 时的最终消息快照
 * - meta: {icon, label} 展示元信息（前后端唯一事实来源）
 */

/** 4 种事件类型 */
export const TOOL_EVENT_TYPES = ['tool_start', 'tool_progress', 'tool_stop', 'tool_error'] as const;

/** 事件类型字面量 */
export type ToolEventType = (typeof TOOL_EVENT_TYPES)[number];

/**
 * 类型守卫：判断字符串是否是合法 ToolEventType
 *
 * @param t 待检查字符串
 * @returns true 当 t 是 4 种合法事件类型之一
 */
export function isToolEventType(t: string): t is ToolEventType {
  return (TOOL_EVENT_TYPES as readonly string[]).includes(t);
}

/** data 字段：业务字段字典 */
export interface ToolEventData {
  args?: Record<string, unknown>;
  workspace?: string;
  root_path?: string;
  description?: string;
  child_stream?: unknown;
  message?: string;
  status?: string;
  result?: unknown;
  final_summary?: unknown;
  duration_ms?: number;
  error_type?: string;
  error_message?: string;
  thread_id?: string;
  parent_prompt?: string;
  child_messages?: Array<Record<string, unknown>>;
  final_messages?: Array<Record<string, unknown>>;
  meta?: { icon: string; label: string };
  current?: number;
  total?: number;
  percentage?: number;
  [key: string]: unknown;
}

/** ToolEvent 接口 */
export interface ToolEvent {
  type: ToolEventType;
  tool: string;
  tool_call_id: string;
  /** 时间戳：秒（浮点） */
  timestamp: number;
  data: ToolEventData;
}

/**
 * 创建 ToolEvent
 *
 * @param eventType 事件类型（必须是 4 种之一）
 * @param tool 工具名
 * @param tool_call_id 父 LLM 调用本工具的 tool_call_id
 * @param data 业务字段（可选；不传则为空对象）
 * @returns ToolEvent 实例
 */
export function createToolEvent(
  eventType: ToolEventType,
  tool: string,
  tool_call_id: string,
  data?: ToolEventData,
): ToolEvent {
  return {
    type: eventType,
    tool,
    tool_call_id,
    timestamp: Date.now() / 1000,
    data: data ?? {},
  };
}

/**
 * BaseFilesystemTool - 文件系统子智能体基础执行器
 *
 * 1:1 翻译自 `app/core/tools/base/BaseFilesystemTool.py`（**Phase 1 简化版**）。
 *
 * ## Phase 1 范围
 * - 路径校验（与 FilesystemReadTools.validateRootPath 共用）
 * - 子智能体生命周期：**占位桩**（直接返回 prompt 回显）
 * - 流式 ToolEvent：仅生成 `tool_start` + `tool_stop`，**不接入 LangGraph stream writer**
 * - 用户停止信号：仅暴露 `getCurrentRequest()` 的访问（不实际 break 子 agent）
 * - LangGraph Command 返回：返回占位结构（**Phase 5/6 接入真正子 agent 后**改为真 Command）
 *
 * ## Phase 5/6 接入计划
 * - `createChildAgent` 替换为 `@langchain/langgraph` `create_react_agent` 或自实现 StateGraph
 * - 流式循环改为 `for await (const chunk of child_agent.stream(...))`
 * - `Command` 替换为 LangGraph `Command` 类型（见 `@langchain/langgraph`）
 *
 * ## 设计原则
 * - 行为契约与 Python 原版对齐（tool_start/progress/stop/error 事件流）
 * - 子智能体注册表由 `subagentRegistry.ts` 维护
 * - 工具事件由 `events.ts` 定义
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { validateRootPath, listRootEntries } from '../FilesystemReadTools';
import { createToolEvent } from '../events';
import { getCurrentRequest } from '../stopSignal';
import { getSubagentMeta } from '../subagentRegistry';

/**
 * BaseFilesystemTool 子类可覆盖 system_prompt 等字段；
 * Phase 1 用构造参数简单注入
 */
export interface BaseFilesystemToolOptions {
  toolName: string;
  systemPrompt: string;
  maxFileSizeMb?: number;
}

/**
 * 流式事件回调（Phase 1 占位：用回调模拟 stream writer）
 */
export type StreamWriterLike = (event: Record<string, unknown>) => void;

/**
 * 子智能体运行结果（Phase 1 占位；Phase 5 改为 LangGraph Command）
 */
export interface SubagentResult {
  prompt: string;
  taskId: string;
  rootPath: string;
  answer: string;
  durationMs: number;
  entries: string[];
}

/**
 * 简化版 BaseFilesystemTool
 *
 * Phase 1 行为：校验 root_path → 触发 tool_start → 列目录 → 触发 tool_stop → 返回结果
 */
export class BaseFilesystemTool {
  readonly toolName: string;
  readonly systemPrompt: string;
  readonly maxFileSizeMb: number;

  constructor(opts: BaseFilesystemToolOptions) {
    this.toolName = opts.toolName;
    this.systemPrompt = opts.systemPrompt;
    this.maxFileSizeMb = opts.maxFileSizeMb ?? 10;
  }

  /**
   * 触发 tool_start 事件（Phase 1 占位）
   *
   * Phase 5/6 替换为 `writer(dict(start_event))`
   */
  emitStart(
    writer: StreamWriterLike | undefined,
    args: { prompt: string; rootPath: string; toolCallId: string },
  ): void {
    if (!writer) return;
    const ev = createToolEvent('tool_start', this.toolName, args.toolCallId, {
      args: { prompt: args.prompt },
      root_path: args.rootPath,
      description: `开始文件探索: ${args.prompt.slice(0, 100)}`,
      thread_id: args.toolCallId,
      parent_prompt: args.prompt,
      meta: getSubagentMeta(this.toolName),
    });
    writer(ev as unknown as Record<string, unknown>);
  }

  /**
   * 触发 tool_stop 事件（Phase 1 占位）
   */
  emitStop(
    writer: StreamWriterLike | undefined,
    args: {
      prompt: string;
      toolCallId: string;
      durationMs: number;
      result: SubagentResult;
      status: 'success' | 'stopped_by_user' | 'failure';
    },
  ): void {
    if (!writer) return;
    const ev = createToolEvent('tool_stop', this.toolName, args.toolCallId, {
      status: args.status,
      result: args.result,
      duration_ms: args.durationMs,
      thread_id: args.toolCallId,
      parent_prompt: args.prompt,
    });
    writer(ev as unknown as Record<string, unknown>);
  }

  /**
   * 触发 tool_error 事件（Phase 1 占位）
   */
  emitError(
    writer: StreamWriterLike | undefined,
    args: { prompt: string; toolCallId: string; durationMs: number; error: Error },
  ): void {
    if (!writer) return;
    const ev = createToolEvent('tool_error', this.toolName, args.toolCallId, {
      error_type: args.error.constructor.name,
      error_message: args.error.message,
      args: { prompt: args.prompt },
      duration_ms: args.durationMs,
      thread_id: args.toolCallId,
      parent_prompt: args.prompt,
    });
    writer(ev as unknown as Record<string, unknown>);
  }

  /**
   * 检查停止信号（Phase 1 占位）
   *
   * Phase 5/6 替换为 `await request.is_disconnected()` in stream loop
   *
   * @returns true 表示用户已断开
   */
  async isStoppedByUser(): Promise<boolean> {
    const req = getCurrentRequest();
    if (!req) return false;
    try {
      return await req.isDisconnected();
    } catch {
      return false;
    }
  }

  /**
   * Phase 1 主流程：校验 + 列表 + 返回
   *
   * Phase 5/6 替换为 LangGraph 子智能体流式执行
   *
   * @param args.prompt 任务描述
   * @param args.root_path 根目录
   * @param args.tool_call_id 父 LLM 调用 ID
   * @param writer 流式事件回调（Phase 5/6 改为 LangGraph get_stream_writer）
   * @returns 子智能体结果
   */
  async run(
    args: { prompt: string; root_path: string; tool_call_id: string },
    writer?: StreamWriterLike,
  ): Promise<SubagentResult> {
    const startTime = Date.now();
    this.emitStart(writer, {
      prompt: args.prompt,
      rootPath: args.root_path,
      toolCallId: args.tool_call_id,
    });

    try {
      const absRoot = await validateRootPath(args.root_path);

      // 简化版：列出根目录直接子项作为"答案"
      // Phase 5/6 替换为子智能体流式推理
      const entries = await listRootEntries(absRoot);

      const answer =
        `Phase 1 占位返回：根目录 ${absRoot} 含 ${entries.length} 个直接子项：\n` +
        entries.map((e) => `  - ${e}`).join('\n');

      const durationMs = Date.now() - startTime;
      const result: SubagentResult = {
        prompt: args.prompt,
        taskId: args.tool_call_id,
        rootPath: absRoot,
        answer,
        durationMs,
        entries,
      };

      this.emitStop(writer, {
        prompt: args.prompt,
        toolCallId: args.tool_call_id,
        durationMs,
        result,
        status: 'success',
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitError(writer, {
        prompt: args.prompt,
        toolCallId: args.tool_call_id,
        durationMs,
        error,
      });
      throw error;
    }
  }
}

/**
 * 工厂：创建 LangChain tool 包装
 *
 * @param toolName 子智能体工具名（必须先 registerSubagent）
 * @param systemPrompt 子智能体系统提示词
 * @returns LangChain StructuredTool
 */
export function createBaseFilesystemTool(toolName: string, systemPrompt: string) {
  const instance = new BaseFilesystemTool({ toolName, systemPrompt });
  return tool(
    async (args: { prompt: string; root_path: string }) => {
      const toolCallId = `call_${Date.now().toString(36)}`;
      const result = await instance.run({
        prompt: args.prompt,
        root_path: args.root_path,
        tool_call_id: toolCallId,
      });
      return JSON.stringify(result, null, 2);
    },
    {
      name: toolName,
      description: `文件系统子智能体（${toolName}）：在指定目录下探索文件。`,
      schema: z.object({
        prompt: z.string().min(1),
        root_path: z.string().min(1),
      }),
    },
  );
}

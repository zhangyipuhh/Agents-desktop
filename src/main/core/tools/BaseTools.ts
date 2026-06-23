/**
 * BaseTools - Agent 基础工具集
 *
 * 1:1 翻译自 `app/core/tools/BaseTools.py`（简化 Phase 1 版本）。
 *
 * 提供最基础的、与业务无关的工具：
 * - get_current_time：返回当前系统时间字符串
 * - echo_input：回显输入（用于测试）
 *
 * 复杂工具（open_file / read_cached_chunk / load_web_page）依赖 LangGraph
 * Store / DocumentLoader / RecursiveCharacterTextSplitter，Phase 1 不实现，
 * Phase 5 (Renderer/业务) 阶段再补全。
 *
 * 所有工具通过 `tool()` 工厂包装为 LangChain `StructuredTool`，可直接挂到
 * LangGraph StateGraph 的 `ToolNode`。
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 获取当前时间工具
 *
 * 仅在用户明确询问时间、日期或需要时间上下文时调用。
 *
 * @returns 格式 "YYYY-MM-DD HH:MM:SS"
 */
export const getCurrentTime = tool(
  async () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ts =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return ts;
  },
  {
    name: 'get_current_time',
    description: '获取当前系统时间。仅在用户询问时间相关问题时调用。',
    schema: z.object({}),
  },
);

/**
 * 回显输入（测试用）
 *
 * @param args.text 要回显的文本
 * @returns 原样返回输入
 */
export const echoInput = tool(
  async (args: { text: string }) => {
    return args.text;
  },
  {
    name: 'echo_input',
    description: '回显输入文本（仅用于测试）。',
    schema: z.object({ text: z.string() }),
  },
);

/** 默认基础工具列表 */
export const BASE_TOOLS = [getCurrentTime, echoInput] as const;

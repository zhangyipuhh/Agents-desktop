/**
 * FilesystemReadTools - 文件系统读取工具集（Phase 1 简化版）
 *
 * 1:1 翻译自 `app/core/tools/FilesystemReadTools.py`（简化 Phase 1 版本）。
 *
 * ## Phase 1 范围
 * - 提供 `explore` 工具的**接口契约 + 路径校验**（不执行真实子 agent 流）
 * - 实际子智能体执行依赖 `BaseFilesystemTool`，Phase 5/Phase 6 接入
 *
 * ## 设计动机
 * `explore` 是 subagent 工具（详见 `subagentRegistry.ts`）：
 * - 接受用户 prompt
 * - 在指定 `root_path` 下递归搜索/读取文件
 * - 通过 `ToolEvent` 推送 tool_start / tool_progress / tool_stop
 *
 * Phase 1 简化：直接返回 root_path 校验结果 + 文件清单占位（不调 LLM）。
 * 后续接入 BaseFilesystemTool 后替换为真正的子智能体调用。
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 校验根目录
 *
 * @param rootPath 根目录路径（字符串）
 * @returns 校验后的绝对路径
 * @throws Error 目录不存在/不是目录/为空
 */
export async function validateRootPath(rootPath: string): Promise<string> {
  const abs = path.resolve(rootPath);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) throw new Error(`工作空间文件夹不存在: ${abs}`);
  if (!stat.isDirectory()) throw new Error(`路径不是文件夹: ${abs}`);
  // 检查是否为空（用 readdir 避免 iterdir 问题）
  const entries = await fs.readdir(abs).catch(() => []);
  if (entries.length === 0) throw new Error(`工作空间文件夹为空: ${abs}`);
  return abs;
}

/**
 * 列出根目录直接子项（Phase 1 占位实现）
 *
 * @param rootPath 已校验的根目录
 * @returns 子项名列表
 */
export async function listRootEntries(rootPath: string): Promise<string[]> {
  return fs.readdir(rootPath);
}

/**
 * explore 工具（Phase 1 简化版）
 *
 * 完整实现（Phase 5/6 接入 BaseFilesystemTool）：
 * - 创建 explore 子 agent
 * - 流式推送 tool_start / tool_progress / tool_stop
 * - 返回包含子 agent 最终回答的 ToolMessage
 *
 * @param args.prompt 父 LLM 改写的详细任务描述
 * @param args.root_path 目标根目录
 * @returns 占位返回：根目录子项清单（Phase 5 替换为子智能体结果）
 */
export const explore = tool(
  async (args: { prompt: string; root_path: string }) => {
    const abs = await validateRootPath(args.root_path);
    const entries = await listRootEntries(abs);
    return JSON.stringify(
      {
        phase: 1,
        tool: 'explore',
        root_path: abs,
        prompt: args.prompt,
        entries,
        message:
          'Phase 1 占位返回：实际子智能体执行待 Phase 5/6 接入 BaseFilesystemTool 后替换。',
      },
      null,
      2,
    );
  },
  {
    name: 'explore',
    description:
      '在指定目录下递归搜索/读取文件，由子智能体完成。参数：prompt（任务描述）+ root_path（搜索根目录）。',
    schema: z.object({
      prompt: z.string().min(1),
      root_path: z.string().min(1),
    }),
  },
);

/** 默认 FS 读取工具列表 */
export const FILESYSTEM_READ_TOOLS = [explore] as const;

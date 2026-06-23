/**
 * MCP 服务器配置文件 Zod Schema
 *
 * 字段语义：
 * - `enabled`：桌面端开关，控制该 server 是否被实际连接
 * - `type`：`sse`（HTTP Server-Sent Events）、`http`（HTTP streamable）、`stdio`（本地子进程）
 * - `sampling`：LLM 采样回调（让 MCP server 反过来调本地 LLM）
 * - `progressReporting`：是否向客户端推送工具执行进度
 * - `toolConfig`：工具注入策略（白/黑名单、结果解包）
 */
import { z } from 'zod';

/**
 * LLM 采样回调配置：允许 MCP server 通过 callback 向主进程请求 LLM 推理。
 */
export const SamplingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxTokens: z.number().int().positive().optional(),
});

/**
 * 工具执行进度上报配置：开启后，工具执行过程会推送 progress 事件到客户端。
 */
export const ProgressReportingConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

/**
 * 工具注入策略：
 * - `enableInjection`：是否在 Agent descriptor 中暴露该 server 的工具
 * - `defaultParamKeys`：自动注入的默认参数（如 sessionId / profileId）
 * - `hiddenParamKeys`：对 LLM 隐藏的参数键（防止敏感信息被模型看到）
 * - `unwrapResult`：是否将工具返回结果自动解包为 LLM 友好格式
 */
export const ToolConfigSchema = z.object({
  enableInjection: z.boolean().default(true),
  defaultParamKeys: z.array(z.string()).default([]),
  hiddenParamKeys: z.array(z.string()).default([]),
  unwrapResult: z.boolean().default(false),
});

/**
 * 单个 MCP server 配置。
 *
 * 类型约束：
 * - `sse` / `http`：必须提供 `url`
 * - `stdio`：必须提供 `command`，可选 `args` / `env`
 */
export const McpServerConfigSchema = z
  .object({
    name: z.string().min(1, "must not be empty"),
    enabled: z.boolean().default(true),
    type: z.enum(['sse', 'http', 'stdio']),
    url: z.string().url().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeout: z.number().int().positive().default(30),
    readTimeout: z.number().int().positive().default(300),
    connectTimeout: z.number().int().positive().default(30),
    tags: z.array(z.string()).default([]),
    sampling: SamplingConfigSchema.default({ enabled: false }),
    progressReporting: ProgressReportingConfigSchema.default({ enabled: false }),
    toolConfig: ToolConfigSchema.default({
      enableInjection: true,
      defaultParamKeys: [],
      hiddenParamKeys: [],
      unwrapResult: false,
    }),
  })
  .refine(
    (cfg) => (cfg.type === 'sse' || cfg.type === 'http' ? !!cfg.url : true),
    { message: 'url is required for sse/http server', path: ['url'] },
  )
  .refine((cfg) => (cfg.type === 'stdio' ? !!cfg.command : true), {
    message: 'command is required for stdio server',
    path: ['command'],
  });

/**
 * 顶层配置文件结构。
 *
 * - `version`：固定 1，未来 schema 演进时升级
 * - `servers`：以 server 名为 key 的字典
 * - `updatedAt`：ISO datetime，最近一次写入时间
 */
export const McpConfigFileSchema = z.object({
  version: z.literal(1),
  servers: z.record(z.string(), McpServerConfigSchema),
  updatedAt: z.string().datetime(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;
export type SamplingConfig = z.infer<typeof SamplingConfigSchema>;
export type ProgressReportingConfig = z.infer<typeof ProgressReportingConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

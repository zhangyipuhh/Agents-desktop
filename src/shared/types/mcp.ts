/**
 * MCP 共享类型：暴露给渲染层（preload + renderer）
 *
 * 暴露 `McpServerConfigInput`（含 default 前）便于在渲染层做"最小必填表单"，
 * 完整 `McpServerConfig` 形态由主进程校验后落地。
 */
export type { McpServerConfig, McpServerConfigInput, McpConfigFile } from '../../main/mcp/shared/mcpConfigSchema';

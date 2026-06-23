/**
 * 共享类型：入口索引
 *
 * 渲染层与主进程均通过 `@shared/types` 访问。
 * 重新导出所有 schema 与类型，避免分散 import。
 *
 * 注意：`.d.ts` 声明文件（如 window.d.ts）不能通过 `export *` 重导出，
 * 它们由 tsconfig 自动 include，渲染层代码直接用 `window.electronAPI` 即可。
 */

export * from './common';
export * from './message';
export * from './llm';

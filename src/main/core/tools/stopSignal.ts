/**
 * 子智能体停止信号传递机制
 *
 * 1:1 翻译自 `app/core/tools/_stop_signal.py`。
 *
 * Python 原版用 `contextvars.ContextVar` 跨 await 保持 Request 引用，
 * Node 等价物是 `AsyncLocalStorage`（Node 16+ 内置；跨 await 保持 context）。
 *
 * ## 使用模式
 *
 * 主路由入口（Electron IPC handler）：
 * ```ts
 * import { setCurrentRequest, resetCurrentRequest } from '@main/core/tools/stopSignal';
 *
 * const token = setCurrentRequest({ isDisconnected: async () => false });
 * try {
 *   // 业务逻辑
 * } finally {
 *   resetCurrentRequest(token);
 * }
 * ```
 *
 * 工具函数内（async）：
 * ```ts
 * const req = getCurrentRequest();
 * async for (const chunk of childAgent.stream(...)) {
 *   if (req && (chunkCount % 5 === 0)) {
 *     if (await req.isDisconnected()) break;  // 停止 + cleanup
 *   }
 * }
 * ```
 *
 * ## 设计要点
 *
 * - AsyncLocalStorage 跨 `await` 自动继承 context；多请求并发各请求独立
 * - 同步函数不兼容（需改 async stream）；Phase 1 默认是 async tool
 * - finally 必须 reset，避免跨请求误判
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** Request-like 接口：仅用到 `isDisconnected()` */
export interface StopRequestLike {
  isDisconnected(): Promise<boolean> | boolean;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<StopRequestLike | null | undefined>();

/** Token 类型：用于 reset 当前 context 到入口前状态 */
export type StopSignalToken = { _token: symbol };

/**
 * 在主路由入口调用，把当前"Request"挂到 AsyncLocalStorage
 *
 * @param req Request-like 对象；可传 null/undefined
 * @returns token；可在 finally 传给 `resetCurrentRequest`
 */
export function setCurrentRequest(req: StopRequestLike | null | undefined): StopSignalToken {
  storage.enterWith(req);
  return { _token: Symbol('stopSignal') };
}

/**
 * 在 finally 块调用，重置当前 context 到入口前状态
 *
 * 实现说明：Node AsyncLocalStorage 不支持回滚到 set 之前的状态，
 * 这里我们 enterWith(undefined) 模拟"清空"。
 *
 * @param token `setCurrentRequest` 返回的 token（占位参数，保持 API 对称）
 */
export function resetCurrentRequest(token: StopSignalToken): void {
  void token;
  storage.enterWith(undefined);
}

/**
 * 在工具函数内调用，取出当前 context 内的 Request
 *
 * @returns 当前 Request；未在 context 内调用时返回 undefined；
 *          显式 set(null) 后返回 null（区分"未设置"和"显式置空"）
 */
export function getCurrentRequest(): StopRequestLike | null | undefined {
  const v = storage.getStore();
  return v === undefined ? undefined : v;
}

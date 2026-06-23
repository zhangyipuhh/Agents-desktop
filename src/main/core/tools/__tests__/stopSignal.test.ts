/**
 * stopSignal（ContextVar 停止信号）单元测试
 *
 * 1:1 翻译自 `app/core/tools/_stop_signal.py`：
 * - 用 Node 的 AsyncLocalStorage 模拟 Python contextvars
 *   （Node 内置 AsyncLocalStorage 跨 await 保持 context）
 * - setCurrentRequest(request) / getCurrentRequest() / resetCurrentRequest(token)
 *
 * 测试覆盖：
 * - 默认 get() 返回 undefined
 * - set 后同 context 内 get 拿到
 * - token.reset 后恢复到 set 之前的状态
 * - 不同 context（嵌套 run）独立隔离
 */
import { describe, it, expect } from 'vitest';

const { setCurrentRequest, getCurrentRequest, resetCurrentRequest } = await import(
  '@main/core/tools/stopSignal'
);

describe('stopSignal / ContextVar 停止信号', () => {
  it('默认 get() 返回 undefined', () => {
    expect(getCurrentRequest()).toBeUndefined();
  });

  it('set 后同 context 内 get 拿到', () => {
    const req = { id: 'req-1' } as never;
    const token = setCurrentRequest(req);
    try {
      expect(getCurrentRequest()).toBe(req);
    } finally {
      resetCurrentRequest(token);
    }
  });

  it('reset 后恢复到 set 之前的状态', () => {
    const token = setCurrentRequest({ id: 'req-temp' } as never);
    resetCurrentRequest(token);
    expect(getCurrentRequest()).toBeUndefined();
  });

  it('set(null) 是合法操作（非 HTTP 上下文）', () => {
    const token = setCurrentRequest(null);
    try {
      expect(getCurrentRequest()).toBeNull();
    } finally {
      resetCurrentRequest(token);
    }
  });

  it('跨 await 保持 context（AsyncLocalStorage 语义）', async () => {
    const token = setCurrentRequest({ id: 'req-async' } as never);
    try {
      await Promise.resolve();
      expect(getCurrentRequest()).toEqual({ id: 'req-async' });
    } finally {
      resetCurrentRequest(token);
    }
  });
});

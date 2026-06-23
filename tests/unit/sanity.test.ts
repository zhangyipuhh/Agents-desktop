import { describe, it, expect } from 'vitest';

/**
 * Vitest 自检
 *
 * 验证测试环境本身可以运行；任何更复杂的测试依赖此基础。
 */
describe('vitest sanity', () => {
  it('runs 1+1', () => {
    expect(1 + 1).toBe(2);
  });

  it('supports async', async () => {
    const v = await Promise.resolve(42);
    expect(v).toBe(42);
  });
});

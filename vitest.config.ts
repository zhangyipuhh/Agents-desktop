import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest 配置
 *
 * - `environment: 'node'`：默认 Node 环境（Electron 主进程测试需要）
 * - `setupFiles`：统一注入 electron mock（详见 src/main/__tests__/setup.ts）
 * - 路径别名与 tsconfig.json 对齐
 * - 覆盖率阈值（阶段 0 暂设宽松，Phase 1+ 收紧）
 */
export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(root, 'src/main'),
      '@preload': path.resolve(root, 'src/preload'),
      '@renderer': path.resolve(root, 'src/renderer'),
      '@shared': path.resolve(root, 'src/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
      'tests/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
    setupFiles: ['src/main/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});

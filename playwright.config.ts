import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置
 *
 * Electron 桌面端 E2E：使用 `_electron.launch()` 启动主进程；
 * Windows 平台下 spawn MCP stdio 子进程时启用 `windowsHide: true`。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

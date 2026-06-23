/**
 * Playwright E2E: Electron 应用启动 + 渲染层 IPC 链路
 *
 * 启动主进程 → 等待 firstWindow → 断言 h1 标题为 "Agents Desktop"
 */

import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

test('app boots and renders h1 title', async () => {
  const app: ElectronApplication = await electron.launch({
    args: [path.join(projectRoot, 'dist-electron', 'main', 'main.js')],
  });

  const window = await app.firstWindow();
  await expect(window.locator('h1')).toHaveText('Agents Desktop');

  await app.close();
});

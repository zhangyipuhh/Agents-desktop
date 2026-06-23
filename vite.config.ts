/**
 * Vite 配置（渲染层）
 *
 * - 入口：src/renderer/index.html
 * - 输出：dist/
 * - 路径别名与 tsconfig.json 对齐
 * - 生产模式 base: './'（让打包后的 index.html 使用相对路径，便于 Electron 加载）
 */

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(root, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(root, 'src/renderer'),
      '@shared': path.resolve(root, 'src/shared'),
      '@main': path.resolve(root, 'src/main'),
      '@preload': path.resolve(root, 'src/preload'),
    },
  },
  plugins: [vue()],
});

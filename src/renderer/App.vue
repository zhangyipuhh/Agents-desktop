<template>
  <div class="app">
    <h1>Agents Desktop</h1>
    <button @click="handlePing">Ping Main</button>
    <p v-if="response">Response: {{ response }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * 渲染层根组件
 *
 * Phase 0 仅做 IPC 链路验证：点击按钮 → 调 `window.electronAPI.ping()` → 显示返回值。
 * 后续 Phase 会替换为侧边栏 + 命令面板 + 设置入口等完整 UI。
 */

import { ref } from 'vue';

/** 主进程 ping 响应字符串（'pong'） */
const response = ref<string>('');

/**
 * 点击按钮：调 preload 暴露的 ping API
 *
 * @returns Promise<void> 无返回值；失败时 console.error
 */
async function handlePing(): Promise<void> {
  try {
    response.value = await window.electronAPI.ping();
  } catch (err) {
    console.error('ping failed', err);
  }
}
</script>

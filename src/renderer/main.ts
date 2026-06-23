/**
 * 渲染进程入口
 *
 * 创建 Vue 应用并挂载到 `#app` 元素。后续会引入 Pinia（状态管理）、Vue Router（路由）。
 */

import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');

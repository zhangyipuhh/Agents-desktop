/**
 * Vue 单文件组件（SFC）类型 shim
 *
 * 让 TypeScript 识别 `.vue` 文件的 import 语句。
 * 由 vue-tsc / Vite 插件在编译时处理真实内容。
 */

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

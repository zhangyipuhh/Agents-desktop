/**
 * 子智能体工具集中注册表
 *
 * 1:1 翻译自 `app/core/tools/subagent_registry.py`。
 *
 * 集中维护"当前系统已注册的子智能体工具名集合"，
 * 供所有需要按 tool 名称判断"是否是子智能体"的后端代码引用，
 * 避免分散硬编码导致漏改。
 *
 * 当前注册的子智能体工具：
 * - sandbox        ：沙箱执行
 * - explore        ：文件探索
 * - query_knowledge：知识库检索
 *
 * ## 与前端的关系
 * 前端（Vue 流式渲染）通过 SSE tool_start 事件 / 历史消息接口中的
 * `meta` 字段动态获取 icon/label，不再硬编码。
 * 后端是唯一事实来源。
 *
 * ## 新增子智能体工具的标准流程
 * 1. 在 `src/main/core/tools/` 下新增工具文件
 * 2. 调用 `registerSubagent(name, { icon, label })` 注册
 * 3. 前端无需修改（自动通过 meta 字段获取）
 */

/** 子智能体展示元信息 */
export interface SubagentMeta {
  icon: string;
  label: string;
}

/** 子智能体工具名集合（frozen 防止运行期误改） */
export const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'sandbox',
  'explore',
  'query_knowledge',
]);

/** 子智能体展示元信息（前后端统一事实来源） */
export const SUBAGENT_META: Record<string, SubagentMeta> = {
  sandbox: { icon: '📦', label: '沙箱执行' },
  explore: { icon: '🔍', label: '文件探索' },
  query_knowledge: { icon: '📚', label: '知识库检索' },
};

/**
 * 判断给定工具名是否为已注册的子智能体工具
 *
 * @param toolName 工具名（不区分大小写）
 * @returns true 表示是子智能体工具；空值或非字符串返回 false
 */
export function isSubagentTool(toolName: string | null | undefined): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  return SUBAGENT_TOOL_NAMES.has(toolName.toLowerCase());
}

/**
 * 获取指定子智能体工具的展示元信息
 *
 * @param toolName 工具名（不区分大小写）
 * @returns `{icon, label}`；未知工具返回兜底 `{icon:'🤖', label: toolName ?? '子智能体'}`
 */
export function getSubagentMeta(toolName: string | null | undefined): SubagentMeta {
  if (!toolName || typeof toolName !== 'string') {
    return { icon: '🤖', label: '子智能体' };
  }
  const key = toolName.toLowerCase();
  const meta = SUBAGENT_META[key];
  if (meta) return { ...meta };
  return { icon: '🤖', label: toolName };
}

/**
 * 注册新的子智能体工具
 *
 * @param name 工具名（大小写归一为小写）
 * @param meta 展示元信息 {icon, label}
 */
export function registerSubagent(name: string, meta: SubagentMeta): void {
  const key = name.toLowerCase();
  (SUBAGENT_TOOL_NAMES as Set<string>).add(key);
  SUBAGENT_META[key] = meta;
}

/**
 * 注销子智能体工具（运行期增减；测试/动态场景使用）
 *
 * @param name 工具名（大小写归一为小写）
 */
export function unregisterSubagent(name: string): void {
  const key = name.toLowerCase();
  (SUBAGENT_TOOL_NAMES as Set<string>).delete(key);
  delete SUBAGENT_META[key];
}

/**
 * 测试专用：重置注册表到默认状态
 * @internal
 */
export function _resetRegistryForTests(): void {
  for (const k of Array.from(SUBAGENT_TOOL_NAMES)) {
    (SUBAGENT_TOOL_NAMES as Set<string>).delete(k);
  }
  for (const k of Object.keys(SUBAGENT_META)) {
    delete SUBAGENT_META[k];
  }
  (SUBAGENT_TOOL_NAMES as Set<string>).add('sandbox');
  (SUBAGENT_TOOL_NAMES as Set<string>).add('explore');
  (SUBAGENT_TOOL_NAMES as Set<string>).add('query_knowledge');
  SUBAGENT_META['sandbox'] = { icon: '📦', label: '沙箱执行' };
  SUBAGENT_META['explore'] = { icon: '🔍', label: '文件探索' };
  SUBAGENT_META['query_knowledge'] = { icon: '📚', label: '知识库检索' };
}

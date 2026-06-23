<template>
  <div class="mcp-config">
    <header class="mcp-config__header">
      <h2>MCP 服务器配置</h2>
      <div class="mcp-config__actions">
        <button type="button" class="btn btn-primary" @click="openAddDialog">
          + 添加服务器
        </button>
        <button type="button" class="btn" :disabled="loading" @click="refresh">
          {{ loading ? '加载中…' : '刷新' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="mcp-config__error">{{ error }}</p>

    <table v-if="servers.length" class="mcp-config__table">
      <thead>
        <tr>
          <th>名称</th>
          <th>类型</th>
          <th>地址 / 命令</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="srv in servers" :key="srv.name">
          <td>{{ srv.name }}</td>
          <td>{{ srv.type }}</td>
          <td class="ellipsis">
            {{ srv.type === 'stdio' ? srv.command : srv.url }}
          </td>
          <td>
            <label class="switch">
              <input
                type="checkbox"
                :checked="srv.enabled"
                @change="onToggle(srv.name, $event)"
              />
              <span>{{ srv.enabled ? '已启用' : '已禁用' }}</span>
            </label>
          </td>
          <td>
            <button type="button" class="btn btn-sm" @click="onTest(srv.name)">
              测试
            </button>
            <button type="button" class="btn btn-sm btn-danger" @click="onRemove(srv.name)">
              删除
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-else-if="!loading" class="mcp-config__empty">暂无 MCP 服务器，点击「添加服务器」开始。</p>

    <!-- 添加/编辑对话框（简化版：内联表单） -->
    <section v-if="dialog" class="mcp-config__dialog">
      <h3>添加 MCP 服务器</h3>
      <label>
        名称
        <input v-model="dialog.server.name" type="text" placeholder="例：高德地图" />
      </label>
      <label>
        类型
        <select v-model="dialog.server.type">
          <option value="sse">SSE</option>
          <option value="http">HTTP</option>
          <option value="stdio">STDIO</option>
        </select>
      </label>
      <label v-if="dialog.server.type === 'sse' || dialog.server.type === 'http'">
        URL
        <input
          v-model="dialog.server.url"
          type="text"
          placeholder="http://localhost:8080/sse"
        />
      </label>
      <template v-else>
        <label>
          命令
          <input v-model="dialog.server.command" type="text" placeholder="npx" />
        </label>
        <label>
          参数（逗号分隔）
          <input
            v-model="dialog.argsText"
            type="text"
            placeholder="-y, @mcp/server-fs, /path"
          />
        </label>
      </template>
      <div class="mcp-config__dialog-actions">
        <button type="button" class="btn" @click="dialog = null">取消</button>
        <button type="button" class="btn btn-primary" @click="onAdd">保存</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * MCP 服务器配置页面
 *
 * - 列表展示当前所有 MCP server（名称、类型、地址、状态）
 * - 启停 / 测试 / 删除 / 新增（简化版：内联表单）
 * - 通过 `window.electronAPI.mcp.*` 调主进程 IPC
 */
import { ref, onMounted } from 'vue';
import type { McpServerConfig } from '@shared/types/mcp';

interface DialogState {
  server: {
    name: string;
    type: 'sse' | 'http' | 'stdio';
    url: string;
    command: string;
  };
  argsText: string;
}

const servers = ref<McpServerConfig[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const dialog = ref<DialogState | null>(null);

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    servers.value = await window.electronAPI.mcp.listServers();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function onToggle(name: string, ev: Event): Promise<void> {
  const enabled = (ev.target as HTMLInputElement).checked;
  try {
    await window.electronAPI.mcp.toggleServer(name, enabled);
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function onTest(name: string): Promise<void> {
  try {
    const result = await window.electronAPI.mcp.testConnection(name);
    if (result.ok) {
      error.value = `${name} 连接成功`;
    } else {
      error.value = `${name} 连接失败：${result.error ?? '未知错误'}`;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function onRemove(name: string): Promise<void> {
  if (!window.confirm(`确认删除 ${name}？`)) return;
  try {
    await window.electronAPI.mcp.removeServer(name);
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function openAddDialog(): void {
  dialog.value = {
    server: { name: '', type: 'sse', url: '', command: '' },
    argsText: '',
  };
}

async function onAdd(): Promise<void> {
  if (!dialog.value) return;
  const { server, argsText } = dialog.value;
  if (!server.name) {
    error.value = '请填写名称';
    return;
  }
  const payload: McpServerConfig = {
    name: server.name,
    type: server.type,
    enabled: true,
  } as McpServerConfig;
  if (server.type === 'sse' || server.type === 'http') {
    (payload as { url?: string }).url = server.url;
  } else {
    (payload as { command?: string }).command = server.command;
    (payload as { args?: string[] }).args = argsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    await window.electronAPI.mcp.addServer(payload);
    dialog.value = null;
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(refresh);
</script>

<style scoped>
.mcp-config {
  padding: 1rem 1.5rem;
  max-width: 960px;
}
.mcp-config__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.mcp-config__actions {
  display: flex;
  gap: 0.5rem;
}
.btn {
  padding: 0.4rem 0.9rem;
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
}
.btn-primary {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}
.btn-danger {
  background: #f56c6c;
  color: #fff;
  border-color: #f56c6c;
}
.btn-sm {
  padding: 0.2rem 0.6rem;
  font-size: 0.85em;
  margin-right: 0.25rem;
}
.mcp-config__table {
  width: 100%;
  border-collapse: collapse;
}
.mcp-config__table th,
.mcp-config__table td {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #ebeef5;
}
.ellipsis {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.mcp-config__error {
  color: #f56c6c;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}
.mcp-config__empty {
  color: #909399;
  font-style: italic;
}
.mcp-config__dialog {
  margin-top: 1.5rem;
  padding: 1rem;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 480px;
}
.mcp-config__dialog label {
  display: flex;
  flex-direction: column;
  font-size: 0.9em;
  gap: 0.25rem;
}
.mcp-config__dialog input,
.mcp-config__dialog select {
  padding: 0.4rem 0.6rem;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}
.mcp-config__dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>

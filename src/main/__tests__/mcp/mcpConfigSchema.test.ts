import { describe, it, expect } from 'vitest';
import {
  McpServerConfigSchema,
  McpConfigFileSchema,
  SamplingConfigSchema,
  ProgressReportingConfigSchema,
  ToolConfigSchema,
} from '@main/mcp/shared/mcpConfigSchema';

describe('mcpConfigSchema', () => {
  describe('SamplingConfigSchema', () => {
    it('accepts minimal sampling config', () => {
      const r = SamplingConfigSchema.safeParse({ enabled: false });
      expect(r.success).toBe(true);
    });

    it('applies default enabled=false when omitted', () => {
      const r = SamplingConfigSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.enabled).toBe(false);
      }
    });

    it('accepts maxTokens', () => {
      const r = SamplingConfigSchema.safeParse({ enabled: true, maxTokens: 1024 });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.maxTokens).toBe(1024);
      }
    });

    it('rejects negative maxTokens', () => {
      const r = SamplingConfigSchema.safeParse({ enabled: true, maxTokens: -1 });
      expect(r.success).toBe(false);
    });
  });

  describe('ProgressReportingConfigSchema', () => {
    it('applies default enabled=false when omitted', () => {
      const r = ProgressReportingConfigSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.enabled).toBe(false);
      }
    });
  });

  describe('ToolConfigSchema', () => {
    it('applies all defaults when omitted', () => {
      const r = ToolConfigSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.enableInjection).toBe(true);
        expect(r.data.defaultParamKeys).toEqual([]);
        expect(r.data.hiddenParamKeys).toEqual([]);
        expect(r.data.unwrapResult).toBe(false);
      }
    });
  });

  describe('McpServerConfigSchema', () => {
    it('accepts SSE server with url', () => {
      const r = McpServerConfigSchema.safeParse({
        name: 'sse-srv',
        type: 'sse',
        url: 'http://localhost:8080/sse',
      });
      expect(r.success).toBe(true);
    });

    it('rejects SSE server without url', () => {
      const r = McpServerConfigSchema.safeParse({ name: 'x', type: 'sse' });
      expect(r.success).toBe(false);
    });

    it('accepts stdio server with command and args', () => {
      const r = McpServerConfigSchema.safeParse({
        name: 'stdio-srv',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@mcp/server-fs', '/tmp'],
      });
      expect(r.success).toBe(true);
    });

    it('rejects stdio server without command', () => {
      const r = McpServerConfigSchema.safeParse({ name: 'x', type: 'stdio' });
      expect(r.success).toBe(false);
    });

    it('accepts http server with url', () => {
      const r = McpServerConfigSchema.safeParse({
        name: 'http-srv',
        type: 'http',
        url: 'http://localhost:9090/mcp',
      });
      expect(r.success).toBe(true);
    });

    it('rejects invalid url', () => {
      const r = McpServerConfigSchema.safeParse({ name: 'x', type: 'sse', url: 'not-a-url' });
      expect(r.success).toBe(false);
    });

    it('applies all defaults for minimal config', () => {
      const r = McpServerConfigSchema.safeParse({
        name: 'minimal',
        type: 'sse',
        url: 'http://x/sse',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.enabled).toBe(true);
        expect(r.data.timeout).toBe(30);
        expect(r.data.readTimeout).toBe(300);
        expect(r.data.connectTimeout).toBe(30);
        expect(r.data.tags).toEqual([]);
        expect(r.data.sampling.enabled).toBe(false);
        expect(r.data.progressReporting.enabled).toBe(false);
        expect(r.data.toolConfig.enableInjection).toBe(true);
      }
    });

    it('rejects empty name', () => {
      const r = McpServerConfigSchema.safeParse({ name: '', type: 'sse', url: 'http://x/sse' });
      expect(r.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const r = McpServerConfigSchema.safeParse({ name: 'x', type: 'websocket', url: 'http://x' });
      expect(r.success).toBe(false);
    });

    it('rejects zero/negative timeouts', () => {
      const r1 = McpServerConfigSchema.safeParse({
        name: 'x',
        type: 'sse',
        url: 'http://x/sse',
        timeout: 0,
      });
      expect(r1.success).toBe(false);
      const r2 = McpServerConfigSchema.safeParse({
        name: 'x',
        type: 'sse',
        url: 'http://x/sse',
        readTimeout: -1,
      });
      expect(r2.success).toBe(false);
    });
  });

  describe('McpConfigFileSchema', () => {
    it('validates file shape with empty servers', () => {
      const r = McpConfigFileSchema.safeParse({
        version: 1,
        servers: {},
        updatedAt: new Date().toISOString(),
      });
      expect(r.success).toBe(true);
    });

    it('validates file shape with servers', () => {
      const r = McpConfigFileSchema.safeParse({
        version: 1,
        servers: {
          s1: { name: 's1', type: 'sse', url: 'http://a/sse' },
        },
        updatedAt: new Date().toISOString(),
      });
      expect(r.success).toBe(true);
    });

    it('rejects wrong version', () => {
      const r = McpConfigFileSchema.safeParse({
        version: 2,
        servers: {},
        updatedAt: new Date().toISOString(),
      });
      expect(r.success).toBe(false);
    });

    it('rejects invalid datetime', () => {
      const r = McpConfigFileSchema.safeParse({
        version: 1,
        servers: {},
        updatedAt: 'not-a-date',
      });
      expect(r.success).toBe(false);
    });
  });
});

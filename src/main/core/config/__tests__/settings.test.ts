/**
 * SettingsService 单元测试
 *
 * 验证：
 * - 默认值兜底
 * - 非法值抛出
 * - 嵌套对象校验（sandbox / skills）
 * - 内存 CRUD
 * - 持久化（load / save）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsService, AppSettingsSchema, SandboxSettingsSchema } from '@main/core/config/SettingsService';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('SettingsService', () => {
  describe('构造与默认值', () => {
    it('无入参时使用 schema 默认值', () => {
      const svc = new SettingsService();
      expect(svc.agentChatMaxConcurrency).toBe(3);
      expect(svc.logLevel).toBe('info');
      expect(svc.debug).toBe(false);
      expect(svc.sandbox.image).toBe('python:3.12-alpine');
      expect(svc.sandbox.maxMemoryMB).toBe(512);
    });

    it('合并入参与默认值', () => {
      const svc = new SettingsService({ agentChatMaxConcurrency: 5, debug: true });
      expect(svc.agentChatMaxConcurrency).toBe(5);
      expect(svc.debug).toBe(true);
      expect(svc.sandbox.image).toBe('python:3.12-alpine');
    });

    it('非法 concurrency 抛出', () => {
      expect(() => new SettingsService({ agentChatMaxConcurrency: 0 })).toThrow();
      expect(() => new SettingsService({ agentChatMaxConcurrency: -1 })).toThrow();
    });
  });

  describe('Sandbox 校验', () => {
    it('maxMemoryMB 下限 64', () => {
      const r = SandboxSettingsSchema.safeParse({ maxMemoryMB: 32 });
      expect(r.success).toBe(false);
    });

    it('maxCpuPercent 范围 10-100', () => {
      expect(SandboxSettingsSchema.safeParse({ maxCpuPercent: 5 }).success).toBe(false);
      expect(SandboxSettingsSchema.safeParse({ maxCpuPercent: 150 }).success).toBe(false);
      expect(SandboxSettingsSchema.safeParse({ maxCpuPercent: 50 }).success).toBe(true);
    });

    it('dockerMode 枚举校验', () => {
      expect(SandboxSettingsSchema.safeParse({ dockerMode: 'local' }).success).toBe(true);
      expect(SandboxSettingsSchema.safeParse({ dockerMode: 'unknown' as unknown as 'local' }).success).toBe(false);
    });
  });

  describe('AppSettingsSchema 顶层', () => {
    it('所有字段可选（都有 default）', () => {
      const r = AppSettingsSchema.safeParse({});
      expect(r.success).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('返回浅拷贝（修改不影响原对象）', () => {
      const svc = new SettingsService();
      const json = svc.toJSON();
      json.agentChatMaxConcurrency = 999;
      expect(svc.agentChatMaxConcurrency).toBe(3);
    });
  });

  describe('持久化', () => {
    let tmpDir: string;
    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-'));
    });
    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('load 在文件不存在时返回默认配置', async () => {
      const svc = await SettingsService.load(path.join(tmpDir, 'nope.json'));
      expect(svc.agentChatMaxConcurrency).toBe(3);
    });

    it('save + load 往返一致', async () => {
      const file = path.join(tmpDir, 'settings.json');
      const original = new SettingsService({ agentChatMaxConcurrency: 7, debug: true });
      await original.save(file);
      const reloaded = await SettingsService.load(file);
      expect(reloaded.agentChatMaxConcurrency).toBe(7);
      expect(reloaded.debug).toBe(true);
    });

    it('load 损坏 JSON 抛出', async () => {
      const file = path.join(tmpDir, 'broken.json');
      await fs.writeFile(file, 'not json', 'utf-8');
      await expect(SettingsService.load(file)).rejects.toThrow();
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '@main/mcp/shared/ConfigManager';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('ConfigManager', () => {
  let tmp: string;
  let seedPath: string;
  let mgr: ConfigManager;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cfg-'));
    seedPath = path.join(tmp, 'seed.json');
    mgr = new ConfigManager({ userDataDir: tmp, seedConfigPath: seedPath });
  });

  describe('load', () => {
    it('returns default config when no file exists', async () => {
      const cfg = await mgr.load();
      expect(cfg.version).toBe(1);
      expect(cfg.servers).toEqual({});
    });

    it('copies seed config on first load and persists it', async () => {
      const seed = {
        version: 1,
        servers: {
          seeded: { name: 'seeded', type: 'sse', url: 'http://seed/sse' },
        },
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(seedPath, JSON.stringify(seed), 'utf-8');

      const cfg = await mgr.load();
      expect(cfg.servers['seeded']).toBeDefined();

      const fileExists = await fs
        .access(path.join(tmp, 'mcp-config.json'))
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('reads existing file on subsequent loads', async () => {
      await mgr.load();
      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });

      const mgr2 = new ConfigManager({ userDataDir: tmp, seedConfigPath: seedPath });
      const cfg = await mgr2.load();
      expect(cfg.servers['s1']).toBeDefined();
    });

    it('rejects invalid JSON in file', async () => {
      await fs.writeFile(path.join(tmp, 'mcp-config.json'), 'not json', 'utf-8');
      await expect(mgr.load()).rejects.toThrow();
    });

    it('rejects file with wrong schema (wrong version)', async () => {
      await fs.writeFile(
        path.join(tmp, 'mcp-config.json'),
        JSON.stringify({ version: 2, servers: {}, updatedAt: new Date().toISOString() }),
        'utf-8',
      );
      await expect(mgr.load()).rejects.toThrow();
    });
  });

  describe('addServer', () => {
    it('persists new server and emits add event', async () => {
      await mgr.load();
      const addHandler = vi.fn();
      const changeHandler = vi.fn();
      mgr.on('add', addHandler);
      mgr.on('change', changeHandler);

      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });

      expect(addHandler).toHaveBeenCalledTimes(1);
      expect(changeHandler).toHaveBeenCalledTimes(1);

      const cfg = await mgr.load();
      expect(cfg.servers['s1']).toBeDefined();
    });

    it('rejects duplicate server name', async () => {
      await mgr.load();
      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });
      await expect(
        mgr.addServer({ name: 's1', type: 'sse', url: 'http://b/sse' }),
      ).rejects.toThrow(/already exists/);
    });

    it('rejects invalid server (missing url for sse)', async () => {
      await mgr.load();
      await expect(mgr.addServer({ name: 'bad', type: 'sse' } as never)).rejects.toThrow();
    });
  });

  describe('updateServer', () => {
    it('patches and persists server', async () => {
      await mgr.load();
      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });

      const updateHandler = vi.fn();
      mgr.on('update', updateHandler);

      await mgr.updateServer('s1', { url: 'http://b/sse' });

      expect(updateHandler).toHaveBeenCalledTimes(1);
      const cfg = await mgr.load();
      expect(cfg.servers['s1']?.url).toBe('http://b/sse');
    });

    it('rejects update on non-existent server', async () => {
      await mgr.load();
      await expect(mgr.updateServer('nope', { url: 'http://x/sse' })).rejects.toThrow(/not found/);
    });
  });

  describe('removeServer', () => {
    it('removes server and emits remove event', async () => {
      await mgr.load();
      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });

      const removeHandler = vi.fn();
      mgr.on('remove', removeHandler);

      await mgr.removeServer('s1');

      expect(removeHandler).toHaveBeenCalledWith({ name: 's1' });
      const cfg = await mgr.load();
      expect(cfg.servers['s1']).toBeUndefined();
    });

    it('rejects remove on non-existent server', async () => {
      await mgr.load();
      await expect(mgr.removeServer('nope')).rejects.toThrow(/not found/);
    });
  });

  describe('toggleServer', () => {
    it('toggles enabled flag and emits toggle event', async () => {
      await mgr.load();
      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });

      const toggleHandler = vi.fn();
      mgr.on('toggle', toggleHandler);

      await mgr.toggleServer('s1', false);

      expect(toggleHandler).toHaveBeenCalledWith({ name: 's1', enabled: false });
      const cfg = await mgr.load();
      expect(cfg.servers['s1']?.enabled).toBe(false);
    });
  });

  describe('importFromYaml', () => {
    it('imports servers from legacy yaml file', async () => {
      const yamlPath = path.join(tmp, 'legacy.yaml');
      const yaml = `mcp_servers:
  oldSrv:
    type: sse
    url: http://legacy/sse
  stdioSrv:
    type: stdio
    command: python
    args: ["-m", "mcp_server"]
`;
      await fs.writeFile(yamlPath, yaml, 'utf-8');

      await mgr.importFromYaml(yamlPath);

      const cfg = await mgr.load();
      expect(cfg.servers['oldSrv']).toBeDefined();
      expect(cfg.servers['oldSrv']?.type).toBe('sse');
      expect(cfg.servers['stdioSrv']).toBeDefined();
      expect(cfg.servers['stdioSrv']?.type).toBe('stdio');
    });

    it('imports empty when no mcp_servers key', async () => {
      const yamlPath = path.join(tmp, 'empty.yaml');
      await fs.writeFile(yamlPath, 'other_key: 1\n', 'utf-8');
      await mgr.importFromYaml(yamlPath);

      const cfg = await mgr.load();
      expect(cfg.servers).toEqual({});
    });
  });

  describe('event ordering', () => {
    it('emits add + change in that order on addServer', async () => {
      await mgr.load();
      const events: string[] = [];
      mgr.on('add', () => events.push('add'));
      mgr.on('change', () => events.push('change'));

      await mgr.addServer({ name: 's1', type: 'sse', url: 'http://a/sse' });
      expect(events).toEqual(['add', 'change']);
    });
  });
});

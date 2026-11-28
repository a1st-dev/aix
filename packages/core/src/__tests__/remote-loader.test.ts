import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { fetchWithTimeout, loadFromLocalPath, loadFromSource } from '../remote-loader.js';
import { ConfigNotFoundError, ConfigParseError, UnsupportedUrlError } from '../errors.js';
import { safeRm } from '../fs/safe-rm.js';
import {
   nodeRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
   type RuntimeFetchResponse,
   type RuntimeNetworkAdapter,
} from '../runtime/index.js';

const testDir = join(tmpdir(), 'aix-test-remote-loader');

describe('loadFromLocalPath', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('loads config from absolute path', async () => {
      const config = { skills: {}, mcp: {} },
            configPath = join(testDir, 'ai.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = loadFromLocalPath(configPath);

      expect(result.content).toEqual(config);
      expect(result.source).toBe('local');
      expect(result.isRemote).toBe(false);
   });

   it('loads config from relative path', async () => {
      const config = { skills: { typescript: '^1.0.0' } },
            configPath = join(testDir, 'config', 'ai.json');

      await mkdir(join(testDir, 'config'), { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = loadFromLocalPath('./config/ai.json', testDir);

      expect(result.content).toEqual(config);
      expect(result.baseUrl).toBe(join(testDir, 'config'));
   });

   it('throws ConfigNotFoundError for missing file', () => {
      expect(() => loadFromLocalPath(join(testDir, 'missing.json'))).toThrow(ConfigNotFoundError);
   });

   it('throws ConfigParseError for invalid JSON', async () => {
      const configPath = join(testDir, 'invalid.json');

      await writeFile(configPath, 'not valid json {', 'utf-8');

      expect(() => loadFromLocalPath(configPath)).toThrow(ConfigParseError);
   });

   it('parses JSONC with comments', async () => {
      const configPath = join(testDir, 'ai.json'),
            content = `{
      // This is a comment
      "skills": {},
      "mcp": {} /* inline comment */
    }`;

      await writeFile(configPath, content, 'utf-8');

      const result = loadFromLocalPath(configPath);

      expect(result.content).toEqual({ skills: {}, mcp: {} });
   });
});

describe('loadFromSource', () => {
   beforeEach(async () => {
      await safeRm(testDir, { force: true });
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   it('loads from local path starting with ../', async () => {
      const config = { skills: {} },
            configPath = join(testDir, 'ai.json'),
            subDir = join(testDir, 'subdir');

      await mkdir(subDir, { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await loadFromSource('../ai.json', subDir);

      expect(result.content).toEqual(config);
      expect(result.source).toBe('local');
   });

   it('rejects HTTP URLs', async () => {
      await expect(loadFromSource('http://example.com/ai.json')).rejects.toThrow(UnsupportedUrlError);
   });

   it('rejects unknown formats', async () => {
      await expect(loadFromSource('unknown-format')).rejects.toThrow(UnsupportedUrlError);
   });

   it('treats paths with / as local paths', async () => {
      const config = { skills: {} },
            configPath = join(testDir, 'config', 'ai.json');

      await mkdir(join(testDir, 'config'), { recursive: true });
      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await loadFromSource('config/ai.json', testDir);

      expect(result.content).toEqual(config);
      expect(result.source).toBe('local');
   });

   it('treats paths ending in .json as local paths', async () => {
      const config = { skills: {} },
            configPath = join(testDir, 'custom.json');

      await writeFile(configPath, JSON.stringify(config), 'utf-8');

      const result = await loadFromSource('custom.json', testDir);

      expect(result.content).toEqual(config);
      expect(result.source).toBe('local');
   });
});

function rejectOnAbort<T>(signal: AbortSignal | undefined): Promise<T> {
   return new Promise<T>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
         reject(new DOMException('This operation was aborted', 'AbortError'));
      });
   });
}

function createResponse(overrides: Partial<RuntimeFetchResponse>): RuntimeFetchResponse {
   return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => {
         return '';
      },
      ...overrides,
   };
}

function fetchWith(fetch: RuntimeNetworkAdapter['fetch'], timeoutMs?: number): Promise<string> {
   const adapter: RuntimeAdapter = {
      ...nodeRuntimeAdapter,
      network: { ...nodeRuntimeAdapter.network, fetch },
   };

   return withRuntimeAdapter(adapter, () => {
      return fetchWithTimeout('https://example.com/rules.md', timeoutMs);
   });
}

describe('fetchWithTimeout', () => {
   const TIMEOUT_MS = 20;

   it('returns the response body', async () => {
      const body = await fetchWith(async () => {
         return createResponse({
            text: async () => {
               return 'body text';
            },
         });
      });

      expect(body).toBe('body text');
   });

   it('times out when the headers arrive but the body stalls', async () => {
      const stalledBody = fetchWith(async (_url, init) => {
         return createResponse({
            text: () => {
               return rejectOnAbort(init?.signal);
            },
         });
      }, TIMEOUT_MS);

      await expect(stalledBody).rejects.toThrow(`Request timed out after ${TIMEOUT_MS}ms`);
   });

   it('times out when the server never sends headers', async () => {
      const stalledHeaders = fetchWith((_url, init) => {
         return rejectOnAbort(init?.signal);
      }, TIMEOUT_MS);

      await expect(stalledHeaders).rejects.toThrow(`Request timed out after ${TIMEOUT_MS}ms`);
   });

   it('reports a failed HTTP status', async () => {
      const notFound = fetchWith(async () => {
         return createResponse({ ok: false, status: 404, statusText: 'Not Found' });
      });

      await expect(notFound).rejects.toThrow('HTTP 404: Not Found');
   });
});

describe('loadFromSource with mocked fetch', () => {
   const originalFetch = global.fetch;

   afterEach(() => {
      global.fetch = originalFetch;
   });

   it('loads from HTTPS URL ending in .json', async () => {
      const config = { skills: { typescript: '^1.0.0' } };

      global.fetch = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve(JSON.stringify(config)),
      });

      const result = await loadFromSource('https://example.com/ai.json');

      expect(result.content).toEqual(config);
      expect(result.source).toBe('url');
      expect(result.isRemote).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/ai.json', expect.any(Object));
   });

   it('downloads repo for GitHub blob URL to support relative paths', async () => {
      // GitHub blob URLs now download the entire repo via giget so that relative paths (skills,
      // rules, etc.) can be resolved. This test verifies the behavior change - we no longer just
      // fetch the raw file content.
      //
      // The actual download is handled by giget which we can't easily mock here, so we just verify
      // that the function attempts to download (which will fail with a 404 for fake repos).
      await expect(
         loadFromSource('https://github.com/org/repo/blob/main/ai.json'),
      ).rejects.toThrow(/Failed to fetch remote config/);
   });

   it('converts GitLab blob URL to raw URL', async () => {
      const config = { skills: {} };

      global.fetch = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve(JSON.stringify(config)),
      });

      await loadFromSource('https://gitlab.com/group/project/-/blob/main/ai.json');

      expect(global.fetch).toHaveBeenCalledWith(
         'https://gitlab.com/group/project/-/raw/main/ai.json',
         expect.any(Object),
      );
   });

   it('computes correct baseUrl for remote extends resolution', async () => {
      const config = { extends: ['./base.json'], skills: {} };

      global.fetch = vi.fn().mockResolvedValue({
         ok: true,
         text: () => Promise.resolve(JSON.stringify(config)),
      });

      const result = await loadFromSource('https://example.com/configs/ai.json');

      expect(result.baseUrl).toBe('https://example.com/configs/');
   });
});

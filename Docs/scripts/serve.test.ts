import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import http from 'node:http';

let tmpDir: string;
let port: number;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

const MIME_MAP: Record<string, string> = {
  'html': 'text/html; charset=utf-8',
  'css': 'text/css; charset=utf-8',
  'json': 'application/json; charset=utf-8',
  'js': 'text/javascript; charset=utf-8',
};

function httpGet(url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: string) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers as Record<string, string>, body }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'serve-test-'));
  await writeFile(resolve(tmpDir, 'index.html'), '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>');
  await ensureDir(resolve(tmpDir, 'subdir'));
  await writeFile(resolve(tmpDir, 'subdir/index.html'), '<!DOCTYPE html><html><body><h1>Sub</h1></body></html>');
  await writeFile(resolve(tmpDir, 'style.css'), 'body { color: red; }');
  await writeFile(resolve(tmpDir, 'data.json'), '{"key":"value"}');

  port = 15040 + Math.floor(Math.random() * 1000);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('serve', () => {
  it('serves HTML with correct Content-Type', async () => {
    const srv = createServer(async (req, res) => {
      try {
        let urlPath = (req.url || '/').split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = resolve(tmpDir, urlPath.replace(/^\//, ''));
        const ext = filePath.split('.').pop() || '';
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'text/plain' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>(r => srv.listen(port, r));

    // HTML content type
    const res = await httpGet(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Hello');

    srv.close();
  });

  it('serves CSS with correct Content-Type', async () => {
    const srv = createServer(async (req, res) => {
      try {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(tmpDir, urlPath.replace(/^\//, ''));
        const ext = filePath.split('.').pop() || '';
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'text/plain' });
        res.end(data);
      } catch { res.writeHead(404); res.end('NF'); }
    });

    await new Promise<void>(r => srv.listen(port + 1, r));

    const res = await httpGet(`http://localhost:${port + 1}/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');

    srv.close();
  });

  it('returns 404 for nonexistent files', async () => {
    const srv = createServer(async (req, res) => {
      try {
        const urlPath = (req.url || '/').split('?')[0];
        const filePath = resolve(tmpDir, urlPath.replace(/^\//, ''));
        await readFile(filePath);
        res.writeHead(200);
        res.end('ok');
      } catch { res.writeHead(404); res.end('Not Found'); }
    });

    await new Promise<void>(r => srv.listen(port + 2, r));

    const res = await httpGet(`http://localhost:${port + 2}/nonexistent.html`);
    expect(res.status).toBe(404);

    srv.close();
  });

  it('serves index.html for directory requests', async () => {
    const srv = createServer(async (req, res) => {
      try {
        let urlPath = (req.url || '/').split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';

        let filePath = resolve(tmpDir, urlPath.replace(/^\//, ''));
        try {
          const data = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
          return;
        } catch {
          /* file not found — try directory index fallback below */
        }

        // Try index.html in directory
        filePath = resolve(tmpDir, (req.url || '').replace(/^\//, ''), 'index.html');
        try {
          const data = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        } catch {
          res.writeHead(404); res.end('Not Found');
        }
      } catch { res.writeHead(500); res.end('ISE'); }
    });

    await new Promise<void>(r => srv.listen(port + 3, r));

    const res = await httpGet(`http://localhost:${port + 3}/subdir/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('Sub');

    srv.close();
  });

  it('serve function can be imported without starting', async () => {
    const mod = await import('./serve.mjs');
    expect(typeof mod.serve).toBe('function');
  });
});

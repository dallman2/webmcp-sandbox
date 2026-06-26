#!/usr/bin/env node
// serve.mjs — Minimal static file server for the Docs/ directory.
// Usage: node Docs/scripts/serve.mjs [--port <num>]

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

export function serve(options = {}) {
  const port = options.port || 4040;
  const server = createServer(async (req, res) => {
    try {
      let urlPath = req.url || '/';
      // Remove query string and normalize
      urlPath = urlPath.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = resolve(DOCS_ROOT, urlPath.replace(/^\//, ''));

      // Security: ensure path is within DOCS_ROOT
      if (!filePath.startsWith(DOCS_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      const data = await readFile(filePath);
      console.log(`GET ${urlPath} → 200`);
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') {
        // Directory request — try index.html
        if (err.code === 'EISDIR') {
          const idxPath = resolve(DOCS_ROOT, (req.url || '/').replace(/^\//, ''), 'index.html');
          try {
            const data = await readFile(idxPath);
            console.log(`GET ${req.url} → 200 (index.html)`);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
            return;
          } catch {}
        }
        console.log(`GET ${req.url} → 404`);
        res.writeHead(404);
        res.end('Not Found');
      } else {
        console.log(`GET ${req.url} → 500`);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  });

  server.listen(port, () => {
    console.log(`Docs server running at http://localhost:${port}/`);
  });

  return server;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('serve.mjs')) {
  const args = process.argv.slice(2);
  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 && portIdx + 1 < args.length ? parseInt(args[portIdx + 1], 10) : 4040;
  serve({ port });
}

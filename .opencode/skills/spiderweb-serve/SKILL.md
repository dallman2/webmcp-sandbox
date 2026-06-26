---
name: spiderweb-serve
description: Use when the user asks to browse the docs, "show me the docs", "start the docs server", or wants to view HTML documentation in a web browser.
---

# spiderweb-serve — Browse Docs Locally

Starts a static file server that serves the `Docs/` directory tree as HTML. The human can then browse at `http://localhost:4040`.

## Tools

- **Script**: `Docs/scripts/serve.mjs`
- **Runtime**: Node.js (zero dependencies — uses only `node:http`, `node:fs`, `node:path`)

## Flags

| Flag | Purpose |
|------|---------|
| `--port <num>` | Override the default port (4040) |

## Workflow

1. Run `node Docs/scripts/serve.mjs [--port <num>]`
2. The server starts and logs: `Docs server running at http://localhost:4040/`
3. Tell the user the URL. The server runs indefinitely — the user opens their browser.
4. The agent does NOT browse via HTTP. The agent reads docs via file reads, not the server.
5. To stop: `Ctrl+C` (the user can stop when done).

## Served URLs

| URL | Content |
|-----|---------|
| `/` | Root index (auto-generated) |
| `/epics/<epic>/` | Epic phase listing |
| `/epics/<epic>/phase-<N>/` | Phase sprint listing |
| `/epics/<epic>/phase-<N>/sprint-<N>-<name>/sprint.html` | Sprint plan |
| `/architecture/<name>.html` | Architecture doc |
| `/audits/<name>.html` | Audit report |
| `/references/<name>.html` | Reference doc |
| `/playbooks/` | Playbook inventory |

## MIME Types Supported

`.html` → `text/html`, `.css` → `text/css`, `.js`/`.mjs` → `text/javascript`, `.json` → `application/json`, `.png`/`.jpg`/`.svg`/`.wasm`/`.woff2` (correct types for each)

## Key Behaviors

- Serves from `Docs/` (the parent directory of the `scripts/` directory)
- Default directory requests (`/`, `/epics/`, etc.) resolve to `index.html`
- Path traversal protection: ensures resolved paths stay within `Docs/`
- If a file is missing: returns 404
- The server blocks the terminal — use a separate terminal or background the process

## Files Referenced
- `Docs/scripts/serve.mjs`
- All `Docs/**/*` files (served, not modified)

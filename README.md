# WebMCP Sandbox

Containerized, ephemeral browser sandbox for AI agents using the **Web Model Context Protocol**.
The agent discovers and calls web-page tools through strictly typed JSON payloads — never raw `page.evaluate` JavaScript.

```bash
git clone <repo-url> && cd webmcp-sandbox && make run
```

## Quick Start

### Build & Run

```bash
make run          # build + run with fixture self-test page
make run-host     # build + run targeting your localhost:8180 WebMCP site
```

### Exercise (Smoke Test)

```bash
make smoke-fixture   # full E2E: boot container, run MCP client assertions against fixture
make smoke-host      # full E2E: run assertions against your localhost:8180 site
```

### Connect Your Agent

Point your MCP client at:

| Endpoint | URL |
|----------|-----|
| Streamable HTTP | `http://localhost:3000/mcp` |
| Sandbox config | `http://localhost:3000/sandbox-config` |
| VNC (debugging) | `localhost:5901` |
| Chrome DevTools | `localhost:9222` |

## Architecture

```
AI Agent ──Streamable HTTP (:3000/mcp)──► Rust MCP Server ──WS (:8765)──► Browser Extension ──document.modelContext──► Web Page
                                   │
                              XVFB :99 headless display
                              VNC :5900 (human debugging)
```

## Target Your Site

Point Chromium at any WebMCP-enabled page via env vars:

```bash
# macOS (container → host networking)
docker run -p 3000:3000 -p 5901:5900 \
  --add-host=host.docker.internal:host-gateway \
  -e SANDBOX_TARGET_HOST=host.docker.internal \
  -e SANDBOX_TARGET_URL=http://localhost:8180/ \
  webmcp-sandbox

# Linux (host networking)
docker run --network=host \
  -e SANDBOX_TARGET_URL=http://localhost:8180/ \
  webmcp-sandbox
```

| Env var | Default | Description |
|---------|---------|-------------|
| `SANDBOX_TARGET_URL` | `http://localhost:3000/fixtures/hello.html` | URL Chromium opens on boot |
| `SANDBOX_TARGET_HOST` | (none) | Rewrites `localhost`/`127.0.0.1` in `SANDBOX_TARGET_URL` to this host |

## Exercise

The `exercises/` harness validates the full WebMCP relay chain using a real MCP client (`@modelcontextprotocol/sdk`):

1. `tools/list` — verify server exposes `discover_tools` + `execute_tool`
2. `tools/call discover_tools` — verify page tools are registered
3. `tools/call execute_tool` — execute a tool and verify the result

Results are written to `exercises/output/<timestamp>.json`.

See `exercises/playbook.md` for the full exercise flow and the [AGENTS.md](AGENTS.md) `[CRITICAL PROTOCOL]` for agent constraints.

## Pull & Run (GHCR)

A pre-built image is published to GitHub Container Registry via opt-in workflow dispatch:

```bash
docker pull ghcr.io/<owner>/webmcp-sandbox:latest
docker run -p 3000:3000 -p 5901:5900 ghcr.io/<owner>/webmcp-sandbox:latest
```

Trigger the publish workflow: `gh workflow run docker-publish.yml`

## docker-compose

```bash
docker compose up   # equivalent to make run with fixture default
```

Edit `docker-compose.yml` to uncomment `extra_hosts` (macOS) or `network_mode` (Linux) for host networking.

## Development

### Prerequisites

- Rust 1.85+ and Node.js 22+
- Docker (for full integration builds)

### Local Dev Loop

```bash
# Rust server
cd mcp-server && cargo run

# Extension (requires Chrome)
cd webmcp-extension && npm install && npm run dev

# Docs browser
node Docs/scripts/serve.mjs
```

## Repository Structure

```
├── mcp-server/          Rust MCP translation server (rmcp + tokio + tracing)
├── webmcp-extension/    Thin MV3 Chrome extension (@mcp-b/* MIT packages)
├── exercises/           MCP client smoke harness (@modelcontextprotocol/sdk)
├── docker/              Dockerfile (3-stage) + start.sh
├── Docs/                Spiderweb documentation tree
├── Makefile             Single-command portability
├── docker-compose.yml   Compose orchestration (optional)
└── .opencode/           OpenCode agent configurations
```

## Ports

| Port | Service |
|------|---------|
| 3000 | MCP Streamable HTTP endpoint (`/mcp`, `/sandbox-config`, `/fixtures/*`) |
| 8765 | Internal WebSocket (Rust server ↔ browser extension) |
| 5901 | VNC (human debugging, container :5900) |
| 9222 | Chrome DevTools Protocol |

## License

MIT — see [LICENSE](./LICENSE). The `@mcp-b/*` extension dependencies are also MIT.

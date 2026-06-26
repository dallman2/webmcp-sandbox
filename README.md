# WebMCP Sandbox

Containerized, ephemeral browser sandbox for AI agents using the **Web Model Context Protocol**.

The agent interacts with websites strictly through typed JSON tool calls — never
raw `page.evaluate` JavaScript. A Rust MCP translation server bridges the agent
(SSE) to a headless Chrome instance (via a thin MV3 browser extension).

## Architecture

```
AI Agent ──SSE (:3000/sse)──► Rust MCP Server ──WS (:8765)──► Browser Extension ──document.modelContext──► Web Page
                                         │
                                    XVFB :99 headless display
                                    VNC :5900 (human debugging)
```

## Quick Start

### Build & Run (Docker)

```bash
docker build -f docker/Dockerfile -t webmcp-sandbox .
docker run -p 3000:3000 -p 5900:5900 webmcp-sandbox
```

### Connect Your Agent

Point your agentic harness at:

- **SSE endpoint**: `http://localhost:3000/sse`
- **VNC debugging**: `localhost:5900` (macOS Screen Sharing, or any VNC client)

### Agent System Prompt Constraints

Inject these into your agent's system prompt to prevent script-kiddie behavior:

```
[CRITICAL PROTOCOL]
1. You are interacting with a remote state machine via the Model Context Protocol (MCP).
2. You are FORBIDDEN from using Playwright, Puppeteer, Selenium, or injecting raw JavaScript.
3. You must advance the playbook sequentially.
4. WORKFLOW LOOP:
   - Step 1: Call the tool discovery endpoint to assess available actions on the current state.
   - Step 2: Execute a SINGLE tool using a strictly typed JSON payload.
   - Step 3: Wait for the native system response before proceeding to the next playbook intent.
```

## Repository Structure

```
├── mcp-server/          Rust MCP translation server (rmcp + tokio + tracing)
├── webmcp-extension/    Thin MV3 Chrome extension (@mcp-b/* MIT packages)
├── docker/              Dockerfile (3-stage) + start.sh
├── Docs/                Spiderweb documentation tree
├── .opencode/           OpenCode agent configurations
└── .env.example         Environment template
```

## Development

### Prerequisites

- Rust 1.85+ and Node.js 22+
- Docker (for full integration builds)

### Local Dev Loop

```bash
# Rust server
cd mcp-server && cargo run -- --transport sse --port 3000

# Extension (requires Chrome)
cd webmcp-extension && npm install && npm run dev

# Docs
node Docs/scripts/serve.mjs
```

## Ports

| Port | Service |
|------|---------|
| 3000 | MCP SSE endpoint (agent connection) |
| 5900 | VNC (human debugging) |
| 9222 | Chrome DevTools Protocol |
| 8765 | Internal WS (server ↔ extension) |

## Why This Architecture

1. **Safety** — agent isolated in a Linux container, no access to host cookies or filesystem.
2. **Auditability** — every action is a typed JSON tool call, not an opaque blob of DOM traversal.
3. **Resilience** — agent discovers tools dynamically from the page via `document.modelContext`; adapts to UI changes automatically.

## License

MIT — see [LICENSE](./LICENSE). The `@mcp-b/*` extension dependencies are also MIT.

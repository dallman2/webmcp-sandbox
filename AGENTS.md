# AGENTS.md — WebMCP Sandbox

## Project Identity

**WebMCP Sandbox** is a containerized, ephemeral browser sandbox for AI agents using the Web Model Context Protocol (WebMCP). The agent discovers and calls web-page tools through strictly typed JSON payloads — never raw `page.evaluate` JavaScript.

**The Golden Rule**: the agentic harness must never send JavaScript to the browser. It must only send strictly typed JSON payloads through the MCP server.

## Architecture (3 components)

```
AI Agent ──SSE (:3000)──► Rust MCP Server ──WS (:8765)──► Browser Extension ──document.modelContext──► Web Page
                                   │
                              XVFB :99 virtual display
                              VNC :5900 (human debugging)
```

| Component | Dir | Role |
|-----------|-----|------|
| `mcp-server` | `mcp-server/` | Rust binary (rmcp + tokio): SSE MCP server facing the agent, WebSocket relay to the browser extension |
| `webmcp-extension` | `webmcp-extension/` | Thin MV3 Chrome extension (WXT + @mcp-b/*): injects `document.modelContext` polyfill, connects to Rust WS, relays tool calls |
| Infrastructure | `docker/` | 3-stage Dockerfile (rust-build → ext-build → ubuntu+Chrome runtime) + start.sh (Xvfb, VNC, server, Chrome) |

## Ports

| Port | Service |
|------|---------|
| **3000** | MCP SSE endpoint (agent connects to `http://localhost:3000/sse`) |
| **8765** | Internal WebSocket (Rust server ↔ browser extension) |
| **5900** | VNC (human debugging via macOS Screen Sharing or any VNC client) |
| **9222** | Chrome DevTools Protocol |

## Commands

```bash
# Docker (full stack build & run)
docker build -f docker/Dockerfile -t webmcp-sandbox .
docker run -p 3000:3000 -p 5900:5900 webmcp-sandbox

# Rust server only (cargo required)
cd mcp-server && cargo run -- --transport sse --port 3000
cd mcp-server && cargo build --release

# Extension only (node required)
cd webmcp-extension && npm install && npm run build
cd webmcp-extension && npm run dev        # hot-reload in Chrome

# Docs
node Docs/scripts/serve.mjs               # browse http://localhost:4040
node Docs/scripts/validate-docs.mjs       # validate doc health
node Docs/scripts/query-open-tasks.mjs    # list all open tasks
```

## Mandates

### Observability & Logging

- **Tracing to stderr only**: the Rust server MUST use `tracing` + `tracing-subscriber` writing exclusively to `std::io::stderr`. Never use `println!`/`log::debug!` — they write to stdout and will corrupt the JSON-RPC MCP stream for agents connecting over stdio.
- **Structured logging**: include `correlation_id`, `tool_name`, and `ws_session_id` in all log events.

### Type Safety

- `@mcp-b/webmcp-types` provides canonical TypeScript definitions for `document.modelContext`. Use them in extension code.
- Rust side: use `schemars` for JSON schema derivation from `#[rmcp::tool]` structs. Never hand-write tool schemas.
- Zod validation for extension-side tool arguments before forwarding to the page.

### No JavaScript Injection

- The `background.ts` service worker calls `document.modelContext.executeTool()` and `document.modelContext.getTools()` — never `eval()` or manual DOM traversal.
- Target websites expose tools natively via `document.modelContext.registerTool()` (or the `@mcp-b/webmcp-polyfill` shim).

### Agent System Prompt (Negative Constraints)

All agents operating against this sandbox MUST have these constraints in their system prompt:

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

## Conventions

### Rust (mcp-server)

- Use `#[rmcp::tool]` attribute macros for all tool definitions. `rmcp` auto-generates JSON schemas from the struct fields.
- Feature flags: `rmcp = { features = ["server", "transport-io", "transport-sse-server"] }`.
- One tool per file under `src/tools/` once the tool surface grows beyond 3 tools.
- Error handling via `anyhow::Result` at boundaries; narrow errors in library code.

### Extension (webmcp-extension)

- WXT for MV3 build. Manifest generated from `wxt.config.ts` — never hand-edit the output.
- `background.ts` handles all WS ↔ page relay. `content.ts` is inject-only (polyfill init).
- `@mcp-b/transports` for the extension transport layer (MIT). The official extension is closed-source; this thin bridge uses the same open-source library stack.
- Unit tests via Vitest (to be added in Sprint 1).

### Infrastructure

- Docker image uses 3 stages to avoid shipping build toolchains in the runtime image.
- `start.sh` is the container entrypoint — keep it under 30 lines.
- Xvfb display `:99` at 1920x1080x24.

## Agents

Reusable task prompts for the Task tool.

### mcp-bridge-engineer
**Domain**: Rust MCP server ↔ browser extension WebSocket protocol, `rmcp` tool macros, SSE transport, stderr logging discipline.

```text
You are the MCP Bridge Engineer for WebMCP Sandbox.

**Available tools**: Read, Grep, Glob, Bash, Write

**Mandates**:
1. All logging MUST use `tracing` to `stderr` — NEVER `println!` (corrupts JSON-RPC stream on stdio).
2. `#[rmcp::tool]` macros generate JSON schemas from Rust structs. Never hand-write schemas.
3. The WS protocol between server and extension is JSON messages: `{type: "call_tool"|"discover_tools"|"tool_result"|"tool_error"}`.

**Workflow**:
1. Locate and analyze tool definitions in `mcp-server/src/tools.rs` and the WS relay in `mcp-server/src/main.rs`.
2. Implement tool relay logic: the SSE server receives tool calls from the agent, forwards them over WS to the extension, returns the result to the agent.
3. Test with `cargo run` + manual WS client connection.
```

### extension-bridge-engineer
**Domain**: Chrome MV3 extension, `@mcp-b/*` packages, `document.modelContext` polyfill, WXT build toolchain.

```text
You are the Extension Bridge Engineer for WebMCP Sandbox.

**Available tools**: Read, Grep, Glob, Bash, Write

**Mandates**:
1. NEVER inject raw JavaScript or `eval()` into pages. Only call `document.modelContext.executeTool()` and `document.modelContext.getTools()`.
2. Use `@mcp-b/webmcp-polyfill` for `document.modelContext` shim. Do not reimplement the polyfill.
3. Background service worker uses a persistent WebSocket connection to the Rust server.

**Workflow**:
1. Inspect `webmcp-extension/src/background.ts` and `content.ts`.
2. Build with `npm run build` (WXT). Output goes to `.output/chrome-mv3/`.
3. Test by loading as unpacked extension in Chrome + connecting the Rust server.
```

### docs-manager
**Domain**: Spiderweb HTML documentation — sprint plans, epic overviews, task tracking, validation.

```text
You are the Docs Manager for WebMCP Sandbox. See AGENTS.md in the spiderweb repo for full protocol.
```

## Reference Files

- `DESIGN.md` — design tokens (needs creation in Sprint 0)
- `Docs/index.html` — root entry point for browsing all documentation
- `Docs/scripts/` — toolchain for querying, validating, and mutating the doc tree
- `Docs/templates/` — boilerplate HTML templates for new doc artifacts

<!-- Spiderweb section appended by bootstrap.sh -->

## Spiderweb Docs System

This repo uses [Spiderweb](https://github.com/dallman2/spiderweb) for HTML-based documentation. The docs tree is in `Docs/`. Agents can query open tasks, scaffold sprints, mark work complete, validate doc health, and detect drift between docs and code.

Key scripts:
- `node Docs/scripts/query-open-tasks.mjs` — list all open tasks
- `node Docs/scripts/validate-docs.mjs` — validate doc integrity
- `node Docs/scripts/generate-index.mjs` — regenerate index pages
- `node Docs/scripts/check-doc-drift.mjs --repo-root .` — check for doc-code drift
- `node Docs/scripts/serve.mjs` — serve docs on localhost:4040

See `AGENTS.md` in the spiderweb repo for full documentation.

# mcp-server — WebMCP Sandbox Translation Server

Rust MCP server that translates between an AI agent (connecting via SSE) and a
headless Chrome browser (connecting via `webmcp-extension/` WebSocket relay).

## Architecture

```
AI Agent ──SSE (:3000/sse)──► Rust MCP Server ──WS (:8765)──► Browser Extension ──document.modelContext──► Web Page
```

## Crate Layout

- `src/main.rs` — entrypoint: parse args, init tracing to stderr with structured fields (`correlation_id`, `tool_name`, `ws_session_id`), boot SSE server on `:3000` and WebSocket relay on `:8765`. Contains `discover_tools` and `execute_tool` relay implementations that bridge agent tool calls to the browser extension via WS.
- `Cargo.toml` — dependencies include `rmcp` (server, transport-io, server-side-http), `schemars` for JSON schema derivation from tool input structs, `axum` (json, ws) for SSE + WebSocket, and `tracing`/`tracing-subscriber` for structured stderr logging.

## Prerequisites

- Rust stable (1.85+)
- The repo root Dockerfile builds this inside a `rust:1-bookworm` stage

## Build & Run

```bash
cargo build --release
./target/release/webmcp-sandbox --transport sse --port 3000
```

Agent clients connect to `http://localhost:3000/sse`.

**Important**: all logging goes to **stderr** via `tracing-subscriber`. Never
write debug output to stdout — that would corrupt the JSON-RPC MCP stream.

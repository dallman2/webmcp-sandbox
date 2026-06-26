# mcp-server — WebMCP Sandbox Translation Server

Rust MCP server that translates between an AI agent (connecting via SSE) and a
headless Chrome browser (connecting via `webmcp-extension/` WebSocket relay).

## Architecture

```
AI Agent ──SSE (:3000/sse)──► Rust MCP Server ──WS (:8765)──► Browser Extension ──document.modelContext──► Web Page
```

## Crate Layout

- `src/main.rs` — entrypoint: parse args, init tracing to stderr, boot SSE
- `src/tools.rs` — `#[rmcp::tool]` stubs (discover, get_page_state, relay)
  fleshed out in Sprint 1 with real WebSocket-to-extension bridge

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

# webmcp-extension — Browser Bridge

Thin MV3 Chrome extension that bridges `document.modelContext` tools exposed by web pages to the Rust MCP translation server.

## Stack

- **WXT** — MV3 extension build tool
- **@mcp-b/transports** — browser transport implementations (MIT)
- **@mcp-b/extension-tools** — Chrome Extension API wrappers (MIT)
- **@mcp-b/webmcp-polyfill** — `document.modelContext` polyfill (MIT)

## How it works

1. `content.ts` injects the `@mcp-b/webmcp-polyfill` into every page, making `document.modelContext` available even in browsers without native WebMCP support.
2. `background.ts` (service worker) maintains a WebSocket connection to the Rust MCP server on `ws://127.0.0.1:8765`.
3. When the Rust server sends a `call_tool` or `discover_tools` message, the extension executes it via `chrome.scripting.executeScript` in the active tab, calling the page's `document.modelContext` API.
4. Results are relayed back over WebSocket to the Rust server.

## The Golden Rule

The Rust server **never** sends `page.evaluate` JavaScript. It only sends typed JSON `call_tool` payloads — the extension translates those into `document.modelContext.executeTool()` calls.

## The Official Extension

The official MCP-B browser extension (Chrome Web Store) is **closed source**. This extension is a thin open-source (MIT) alternative built on the same `@mcp-b/*` package ecosystem. See also the community POC at `github.com/MiguelsPizza/WebMCP` (AGPL-3.0, historical).

## Build

```bash
cd webmcp-extension
npm install
npm run build
# Output: .output/chrome-mv3/ (load as unpacked extension)
```

In Docker, the `Dockerfile` stage builds and copies this into `/app/extension`.

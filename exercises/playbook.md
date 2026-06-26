# WebMCP Sandbox Exercise Playbook

The MCP client exercise validates the full WebMCP relay chain:

```
AI Agent -> [:3000/mcp] -> Rust MCP Server -> [:8765 WS] -> Browser Extension -> document.modelContext -> Web Page
```

## Exercise Flow

### Step 1: `tools/list` — Verify Server Tools

The client calls `tools/list` against the MCP Streamable HTTP endpoint. Asserts:
- Response contains at least 2 tools (discover_tools, execute_tool)
- Each tool has a name, description, and inputSchema

### Step 2: `tools/call discover_tools` — Assess Page Tools

The client calls `discover_tools` which relays through the browser extension to the page's `document.modelContext.getTools()`. Asserts:
- Fixture mode: at least 1 tool returned, and a tool named "hello" is present
- Host mode: at least 1 tool returned (any tools the user's site registers)

### Step 3: `tools/call execute_tool` — Execute a SINGLE Tool

The client calls `execute_tool` with a strictly typed JSON payload: `{tool_name: "...", args: {...}}`. This relays through the full chain to the page's tool handler. Asserts:
- Fixture mode: result contains "Hello, OpenCode"
- Host mode: result is non-null and not an error (no isError flag)

### Step 4: Transcript

The full exercise result is written to `exercises/output/<timestamp>.json` with pass/fail status for each step and raw response data.

## Running

```bash
# Fixture self-test (container must be running with default config)
node exercises/smoke.mjs --target fixture

# Host :8180 test (container must be running with SANDBOX_TARGET_URL=http://localhost:8180/)
node exercises/smoke.mjs --target host

# Convenience: boot + exercise via Make
make smoke-fixture
make smoke-host
```

## Expected Output (Fixture, Pass)

```
[PASS] tools/list: 2 server tools discovered
[PASS] discover_tools: found 1 page tool(s) including "hello"
[PASS] execute_tool: greeting contains "Hello, OpenCode"
Transcript: exercises/output/2026-06-26T12-00-00.json
Result: ALL PASSED
```

## Agent Protocol Constraints

The exercise mirrors the AGENTS.md [CRITICAL PROTOCOL] which all agents operating against this sandbox must follow:

1. Interact via Model Context Protocol (MCP) only
2. NO Playwright, Puppeteer, Selenium, or raw JavaScript injection
3. Advance the playbook sequentially
4. WORKFLOW LOOP: discover tools -> execute SINGLE tool -> wait for response -> next intent

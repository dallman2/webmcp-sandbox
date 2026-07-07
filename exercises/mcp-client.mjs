#!/usr/bin/env node
// MCP client helper for sandbox containers.
// Usage:
//   node mcp-client.mjs <endpoint> discover
//   node mcp-client.mjs <endpoint> execute <tool_name> '<json_args>'
//   node mcp-client.mjs <endpoint> list
//   node mcp-client.mjs <endpoint> wait   (polls until extension connects)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [,, endpoint, action, toolName, argsJson] = process.argv;

if (!endpoint || !action) {
  console.error("Usage: node mcp-client.mjs <endpoint> <discover|execute|list|wait> [tool_name] [args_json]");
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL(endpoint));
const client = new Client({ name: "playbook-runner", version: "0.1.0" });

try {
  await client.connect(transport);

  if (action === "list") {
    const result = await client.listTools();
    console.log(JSON.stringify(result.tools || [], null, 2));
  } else if (action === "discover") {
    const result = await client.callTool({ name: "discover_tools", arguments: {} });
    const text = (result.content || []).map(c => c.text || "").join("");
    console.log(text);
  } else if (action === "execute") {
    if (!toolName) { console.error("Missing tool_name"); process.exit(2); }
    const args = argsJson ? JSON.parse(argsJson) : {};
    const result = await client.callTool({
      name: "execute_tool",
      arguments: { tool_name: toolName, args }
    });
    const text = (result.content || []).map(c => c.text || "").join("");
    console.log(text);
  } else if (action === "wait") {
    for (let i = 0; i < 30; i++) {
      try {
        const result = await client.callTool({ name: "discover_tools", arguments: {} });
        const text = (result.content || []).map(c => c.text || "").join("");
        if (!text.includes("no browser extension connected") && !text.includes("no tab matching")) {
          console.log(JSON.stringify({ ready: true, tools: text }));
          break;
        }
      } catch {}
      if (i === 29) { console.log(JSON.stringify({ ready: false })); break; }
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(2);
  }

  await client.close();
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
}

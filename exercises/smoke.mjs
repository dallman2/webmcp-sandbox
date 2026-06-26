#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const TARGET = process.argv.includes("--target") ? process.argv[process.argv.indexOf("--target") + 1] : "fixture";

if (!["fixture", "host"].includes(TARGET)) {
  console.error(`Usage: node smoke.mjs --target <fixture|host>`);
  process.exit(2);
}

const expectedPath = resolve(__dirname, "expected.json");
const expected = JSON.parse(readFileSync(expectedPath, "utf-8"));
const profile = expected[TARGET];

const results = [];
const transcript = { target: TARGET, mcpUrl: MCP_URL, started: new Date().toISOString(), steps: [] };

function record(name, passed, data) {
  results.push({ name, passed });
  transcript.steps.push({ name, passed, ...data });
  const mark = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`[${mark}] ${name}`);
  if (!passed && data?.detail) console.log(`       ${data.detail}`);
}

async function withExtensionRetry(fn, maxAttempts = 10, delayMs = 2000) {
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (attempt > 0) {
      console.log(`       waiting for extension (attempt ${attempt}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      const result = await fn();
      const text = (result.content || []).map((c) => c.text || "").join("");
      if (text.includes("no browser extension connected") || text.includes("no tab matching")) {
        if (attempt < maxAttempts) continue;
      }
      return result;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
    }
  }
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "webmcp-smoke", version: "0.1.0" });
  await client.connect(transport);

  transcript.mcpVersion = client.getServerVersion?.() ?? "unknown";

  // Step 1: tools/list
  try {
    const listResult = await client.listTools();
    const tools = listResult.tools || [];
    const passed = tools.length >= 2;
    record("tools/list", passed, {
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
      detail: passed ? `${tools.length} server tools discovered` : `expected >= 2, got ${tools.length}`,
    });
  } catch (err) {
    record("tools/list", false, { error: err.message });
  }

  // Step 2: discover_tools (with extension-readiness retry)
  try {
    const discoverResult = await withExtensionRetry(() =>
      client.callTool({ name: "discover_tools", arguments: {} }),
    );
    const content = discoverResult.content || [];
    const text = content.map((c) => c.text || "").join("");
    let pageTools = [];
    try {
      pageTools = JSON.parse(text);
    } catch {
      pageTools = [];
    }
    const discoverPassed =
      pageTools.length >= profile.discoverCountMin &&
      (!profile.discoverContains || pageTools.some((t) => t.name === profile.discoverContains));
    record("discover_tools", discoverPassed, {
      toolCount: pageTools.length,
      tools: pageTools.map((t) => t.name),
      detail: discoverPassed
        ? `found ${pageTools.length} page tool(s)${profile.discoverContains ? ` including "${profile.discoverContains}"` : ""}`
        : `expected >= ${profile.discoverCountMin} tools${profile.discoverContains ? ` including "${profile.discoverContains}"` : ""}, got ${pageTools.length}`,
    });
  } catch (err) {
    record("discover_tools", false, { error: err.message });
  }

  // Step 3: execute_tool (with extension-readiness retry)
  try {
    const executeResult = await withExtensionRetry(() =>
      client.callTool({
        name: "execute_tool",
        arguments: { tool_name: "hello", args: { name: "OpenCode" } },
      }),
    );
    const content = executeResult.content || [];
    const text = content.map((c) => c.text || "").join("");
    let resultObj = null;
    try {
      resultObj = JSON.parse(text);
    } catch {
      resultObj = text || null;
    }
    const isError = executeResult.isError;
    const executePassed = profile.executeResultContains
      ? text.includes(profile.executeResultContains)
      : resultObj !== null && !isError;
    record("execute_tool", executePassed, {
      resultType: typeof resultObj,
      isError: !!isError,
      detail: executePassed
        ? `execution returned non-null${profile.executeResultContains ? ` and contains "${profile.executeResultContains}"` : ", non-error result"}`
        : `execute failed: ${isError ? "isError=true" : resultObj === null ? "null result" : "missing expected content"}`,
    });
  } catch (err) {
    record("execute_tool", false, { error: err.message });
  }

  await client.close();
  transcript.finished = new Date().toISOString();
  transcript.passed = results.every((r) => r.passed);

  const outDir = resolve(__dirname, "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `${ts}.json`);
  writeFileSync(outPath, JSON.stringify(transcript, null, 2));
  console.log(`Transcript: ${outPath}`);
  console.log(`Result: ${transcript.passed ? "\x1b[32mALL PASSED\x1b[0m" : "\x1b[31mFAILURES DETECTED\x1b[0m"}`);

  process.exit(transcript.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(`Exercise error: ${err.message}`);
  process.exit(2);
});

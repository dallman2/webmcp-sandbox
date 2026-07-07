import { z } from "zod";

export default defineBackground(() => {
  const SANDBOX_CONFIG_URL = "http://127.0.0.1:3000/sandbox-config";
  const FALLBACK_WS_URL = "ws://127.0.0.1:8765";

  let ws: WebSocket | null = null;
  let wsUrl: string = FALLBACK_WS_URL;
  let targetOrigin: string = "http://localhost";

  const executeToolArgsSchema = z.object({
    toolName: z.string(),
    args: z.unknown(),
  });

  async function fetchConfig() {
    try {
      const resp = await fetch(SANDBOX_CONFIG_URL);
      if (!resp.ok) return;
      const config = await resp.json();
      if (config.wsUrl) wsUrl = config.wsUrl;
      if (config.targetOrigin) targetOrigin = config.targetOrigin;
    } catch {
      // fall back to defaults
    }
  }

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("[bridge] connected to MCP server");
    ws.onclose = () => {
      console.log("[bridge] disconnected, reconnecting in 2s...");
      setTimeout(connect, 2000);
    };
    ws.onerror = (e) => console.error("[bridge] websocket error", e);

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "ping") {
        ws?.send(JSON.stringify({ type: "pong", id: msg.id }));
        return;
      }

      if (msg.type === "call_tool") {
        try {
          const validation = executeToolArgsSchema.safeParse(msg);
          if (!validation.success) {
            ws?.send(
              JSON.stringify({
                type: "tool_error",
                id: msg.id,
                error: `Invalid tool call arguments: ${validation.error.message}`,
              }),
            );
            return;
          }
          const tab = await findTargetTab();
          if (!tab?.id) {
            ws?.send(JSON.stringify({
              type: "tool_error",
              id: msg.id,
              error: `no tab matching target origin ${targetOrigin}`,
            }));
            return;
          }
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            world: "MAIN",
            func: callPageTool,
            args: [msg.toolName, msg.args],
          });
          ws?.send(
            JSON.stringify({
              type: "tool_result",
              id: msg.id,
              result: result[0].result,
            }),
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          ws?.send(
            JSON.stringify({
              type: "tool_error",
              id: msg.id,
              error: message,
            }),
          );
        }
      }

      if (msg.type === "navigate") {
        try {
          const tab = await findTargetTab();
          if (!tab?.id) {
            ws?.send(JSON.stringify({ type: "navigate_error", id: msg.id, error: `no tab matching ${targetOrigin}` }));
            return;
          }
          await chrome.tabs.update(tab.id, { url: msg.url });
          await new Promise(resolve => setTimeout(resolve, 3000));
          ws?.send(JSON.stringify({ type: "navigate_result", id: msg.id, url: msg.url }));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          ws?.send(JSON.stringify({ type: "navigate_error", id: msg.id, error: message }));
        }
      }

      if (msg.type === "discover_tools") {
        try {
          const tab = await findTargetTab();
          if (!tab?.id) {
            ws?.send(JSON.stringify({ type: "tool_error", id: msg.id, error: `no tab matching ${targetOrigin}` }));
            return;
          }
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            world: "MAIN",
            func: discoverPageTools,
          });
          ws?.send(
            JSON.stringify({ type: "discover_result", id: msg.id, tools: result[0].result }),
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          ws?.send(
            JSON.stringify({ type: "tool_error", id: msg.id, error: message }),
          );
        }
      }
    };
  }

  async function callPageTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const mc: any = (document as any).modelContext;
    const mt: any = (navigator as any).modelContextTesting;
    if (!mc && !mt) throw new Error("polyfill not available");

    const inputArgsJson = JSON.stringify(args);

    if (mt?.executeTool) {
      return mt.executeTool(toolName, inputArgsJson);
    }

    if (typeof mc?.executeTool === "function") {
      return mc.executeTool({ name: toolName }, inputArgsJson);
    }

    throw new Error("no executeTool method found on modelContext or modelContextTesting");
  }

  async function discoverPageTools(): Promise<unknown[]> {
    const mc: any = (document as any).modelContext;
    const nmc: any = (navigator as any).modelContext;
    const context = mc || nmc;
    if (!context) {
      return [];
    }
    const tools = await context.getTools();
    return tools.map(
      (t: { name: string; description: string; inputSchema: unknown }) => ({
        name: t.name,
        description: t.description,
        inputSchema:
          typeof t.inputSchema === "string"
            ? (() => { try { return JSON.parse(t.inputSchema as string); } catch { return {}; } })()
            : t.inputSchema,
      }),
    );
  }

  async function findTargetTab(): Promise<chrome.tabs.Tab | undefined> {
    const pattern = targetOrigin + "/*";
    const tabs = await chrome.tabs.query({ url: pattern });
    if (tabs.length > 0) return tabs[0];

    const allTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of allTabs) {
      try { if (new URL(tab.url || "").origin === targetOrigin) return tab; } catch {}
    }

    const active = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active.length > 0) return active[0];

    const any = await chrome.tabs.query({});
    return any[0];
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "page_ready" && msg.url) {
      targetOrigin = new URL(msg.url).origin;
    }
  });

  fetchConfig().then(() => connect());
});
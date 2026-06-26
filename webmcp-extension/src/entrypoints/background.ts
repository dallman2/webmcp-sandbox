export default defineBackground(() => {
  const WS_URL = "ws://127.0.0.1:8765";

  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => console.log("[bridge] connected to MCP server");
    ws.onclose = () => {
      console.log("[bridge] disconnected, reconnecting in 2s...");
      setTimeout(connect, 2000);
    };
    ws.onerror = (e) => console.error("[bridge] websocket error", e);

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "call_tool") {
        const { toolName, args, tabId } = msg;
        try {
          const tab = tabId
            ? await chrome.tabs.get(tabId)
            : (
                await chrome.tabs.query({
                  active: true,
                  currentWindow: true,
                })
              )[0];
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: callPageTool,
            args: [toolName, args],
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

      if (msg.type === "discover_tools") {
        const tab = msg.tabId
          ? await chrome.tabs.get(msg.tabId)
          : (
              await chrome.tabs.query({
                active: true,
                currentWindow: true,
              })
            )[0];
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: discoverPageTools,
        });
        ws?.send(
          JSON.stringify({ type: "discover_result", tools: result[0].result }),
        );
      }
    };
  }

  async function callPageTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!document.modelContext) {
      throw new Error(
        "document.modelContext not available — ensure @mcp-b/webmcp-polyfill is loaded",
      );
    }
    return document.modelContext.executeTool(toolName, JSON.stringify(args));
  }

  async function discoverPageTools(): Promise<unknown[]> {
    if (!document.modelContext) {
      return [];
    }
    const tools = await document.modelContext.getTools();
    return tools.map(
      (t: { name: string; description: string; inputSchema: unknown }) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }),
    );
  }

  connect();
});

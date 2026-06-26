export {};

async function init() {
  if (!document.modelContext) {
    const { initializeWebMCPPolyfill } = await import(
      "@mcp-b/webmcp-polyfill"
    );
    initializeWebMCPPolyfill();
  }
}

init();

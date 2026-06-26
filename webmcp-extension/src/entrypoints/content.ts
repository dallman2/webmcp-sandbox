export default defineContentScript({
  matches: ["<all_urls>"],

  async main() {
    if (!document.modelContext) {
      const { initializeWebMCPPolyfill } = await import(
        "@mcp-b/webmcp-polyfill"
      );
      initializeWebMCPPolyfill();
    }
  },
});

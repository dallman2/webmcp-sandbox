import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

export default defineContentScript({
  matches: ["<all_urls>"],
  world: "MAIN",
  runAt: "document_start",

  main() {
    if (!document.modelContext) {
      initializeWebMCPPolyfill();
    }
    if ((navigator as any).modelContext && !(document as any).modelContext) {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        enumerable: true,
        get() { return (navigator as any).modelContext; },
        set(v) { Object.defineProperty(navigator, "modelContext", { configurable: true, enumerable: true, writable: true, value: v }); },
      });
    }
    chrome.runtime.sendMessage({ type: "page_ready", url: window.location.href }).catch(() => {});
  },
});
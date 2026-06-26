import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: () => ({
    name: "WebMCP Sandbox Bridge",
    description:
      "Bridges document.modelContext tools exposed by web pages to a local MCP translation server",
    permissions: ["activeTab", "scripting", "webNavigation", "tabs"],
    host_permissions: ["<all_urls>"],
    manifest_version: 3,
  }),
});

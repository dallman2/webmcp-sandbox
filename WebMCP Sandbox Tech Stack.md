# **Idiomatic Tech Stack for WebMCP Sandbox**

## **1\. The Extension: How to Ensure Durability**

You asked which extension you should use to guarantee durability.

**The answer is: It doesn't matter, as long as it is a pure polyfill.**

Durability in WebMCP does not come from the extension; it comes from coding your target websites strictly to the navigator.modelContext API standard. If your website correctly exposes its tools via that API, the extension is just a dumb pipe.

**The Recommendation:** Do not use heavy, opinionated automation extensions (like standard Playwright wrappers). Use the bare-minimum **MCP-B (Model Context Protocol \- Browser)** polyfill or the official **WebMCP Tool Inspector** from the WebMCP working group.

* **Why?** Their only job is to bind the page's navigator.modelContext object to a local WebSocket/SSE port. When Chrome natively supports routing this API to the terminal in the future, you will simply delete the extension, change your agent's connection URL, and zero lines of your actual automation logic will break.

## **2\. The Rust Server Build: Essential Crates**

Building an MCP server in Rust is currently the most robust path forward. To do it idiomatically, you want to avoid heavy web frameworks like Axum or Actix if you are just passing JSON-RPC messages.

Here are the crates you need in your Cargo.toml:

### **The Core Protocol**

* **rmcp**: This is the official Rust SDK maintained by the Model Context Protocol team. It is the gold standard.  
  * *Features to enable:* \["server", "transport-io", "transport-sse-server"\]  
  * *Why:* It provides the exact protocol implementation, handles the transport layers (both standard I/O and Server-Sent Events), and includes the critical \#\[tool\] macros that do all the heavy lifting.

### **Async & Data**

* **tokio**: The absolute standard asynchronous runtime for Rust. You will need this to handle the concurrent connections between the agent and the browser.  
  * *Features:* \["full"\]  
* **serde** and **serde\_json**: Essential for serializing and deserializing the JSON-RPC payloads that the agent and the browser exchange.  
* **schemars**: (Often re-exported by rmcp, but good to know). This is what automatically generates the strict JSON schemas from your Rust structs so the LLM knows exactly what parameters a tool requires.

### **Logging (CRITICAL)**

* **tracing** and **tracing-subscriber**: You must use these for logging instead of println\!.  
  * *The Trap:* If you use println\! for debugging, it writes to standard output (stdout). If your agent connects to the container via stdio, **your debug logs will corrupt the JSON-RPC stream and crash the agent.** \* *The Fix:* Use tracing and configure tracing-subscriber to write exclusively to stderr (std::io::stderr). This keeps your logs visible in your Docker console while keeping the stdout pipe perfectly clean for the agent's MCP messages.
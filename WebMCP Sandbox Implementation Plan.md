# **Architecture Plan: Containerized WebMCP Agent Sandbox**

## **1\. Core Philosophy**

The objective is to create an ephemeral, self-contained "browser sandbox" for an AI agent. The agent must interact with websites using explicit WebMCP JSON tool calls, entirely isolated from the user's personal host machine and browser state.

**The Golden Rule:** The agentic harness must *never* send JavaScript (page.evaluate) to the browser. It must *only* send strictly typed JSON payloads to the local MCP server.

## **2\. Infrastructure: The "Virtual Display" Container**

WebMCP strictly requires a "headed" browsing context to function. Because Docker is inherently headless, we will use Xvfb (X Virtual FrameBuffer) to trick Chrome into thinking a physical monitor exists.

### **A. The Dockerfile**

Stack Ubuntu, Chrome, Xvfb, the MCP Server binary (Rust or Node), and the unpacked Bridge Extension.

FROM ubuntu:22.04

\# 1\. Install Chrome, Xvfb, and VNC (for human debugging)  
RUN apt-get update && apt-get install \-y \\  
    wget gnupg xvfb x11vnc libx11-xcb1 libnss3 libatk-bridge2.0-0 libgtk-3-0 \\  
    && wget \-q \-O \- \[https://dl-ssl.google.com/linux/linux\_signing\_key.pub\](https://dl-ssl.google.com/linux/linux\_signing\_key.pub) | apt-key add \- \\  
    && echo "deb \[arch=amd64\] \[http://dl.google.com/linux/chrome/deb/\](http://dl.google.com/linux/chrome/deb/) stable main" \>\> /etc/apt/sources.list.d/google.list \\  
    && apt-get update && apt-get install \-y google-chrome-stable

\# 2\. Mount assets  
COPY ./mcp-server-binary /app/server  
COPY ./webmcp-extension /app/extension  
COPY ./start.sh /app/start.sh

WORKDIR /app  
RUN chmod \+x start.sh

\# Expose SSE port (3000) and VNC debugging port (5900)  
EXPOSE 3000 5900

CMD \["./start.sh"\]

### **B. The Startup Script (start.sh)**

This script initializes the virtual environment, boots the translation server, and attaches Chrome to it.

\#\!/bin/bash

\# 1\. Boot virtual monitor (Screen 99\)  
Xvfb :99 \-screen 0 1920x1080x24 &  
export DISPLAY=:99

\# 2\. Boot VNC Server (Optional: allows you to watch the agent work via macOS Screen Sharing)  
x11vnc \-display :99 \-forever \-nopw \-bg \-rfbport 5900

\# 3\. Boot the local MCP translation server (Rust/Node) via SSE  
./server \--transport sse \--port 3000 &

\# 4\. Launch Chrome with the polyfill extension loaded  
google-chrome \\  
  \--no-sandbox \\  
  \--disable-dev-shm-usage \\  
  \--load-extension=/app/extension \\  
  \--remote-debugging-port=9222 \\  
  "about:blank"

## **3\. Agent Integration & Constraints**

Once the container is running (docker run \-p 3000:3000 \-p 5900:5900 webmcp-sandbox), the agent needs to be pointed at it with aggressive psychological constraints to prevent script-kiddie behavior.

### **A. The Connection**

Configure your agentic harness to connect to the sandbox via HTTP Server-Sent Events (SSE):

* **Endpoint:** http://localhost:3000/sse  
* *Note: Do not tell the agent it is talking to a browser. Treat it as a standard backend API.*

### **B. The System Prompt (Negative Constraints)**

To prevent the agent from attempting to solve the entire monolithic playbook via Playwright batch scripts, inject the following into the agent's core system prompt:

\[CRITICAL PROTOCOL\]  
1\. You are interacting with a remote state machine via the Model Context Protocol (MCP).  
2\. You are FORBIDDEN from using Playwright, Puppeteer, Selenium, or injecting raw JavaScript.  
3\. You must advance the playbook sequentially.   
4\. WORKFLOW LOOP:  
   \- Step 1: Call the tool discovery endpoint to assess available actions on the current state.  
   \- Step 2: Execute a SINGLE tool using a strictly typed JSON payload.  
   \- Step 3: Wait for the native system response before proceeding to the next playbook intent.

## **4\. Why This Architecture Wins**

1. **Safety:** The agent is physically isolated in a Linux container. It cannot access your personal cookies or filesystem.  
2. **Auditability:** Because the agent is forced to use WebMCP's JSON schemas, you get a clean, human-readable log of every single action the agent takes (e.g., Action: add\_to\_cart, Payload: { item: "shoes" }) instead of an unreadable blob of page.evaluate DOM traversal code.  
3. **Resilience:** When the website updates its UI, standard DOM scripts break. Because the agent is pulling the schema dynamically from the bridge, it adapts to UI changes automatically.
#!/bin/bash
set -e

echo "[sandbox] booting virtual display..."
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

echo "[sandbox] booting VNC (port 5900)..."
x11vnc -display :99 -forever -nopw -bg -rfbport 5900 2>/dev/null

echo "[sandbox] starting MCP translation server (SSE :3000, WS :8765)..."
/app/server --transport sse --port 3000 &

sleep 2

echo "[sandbox] launching Chrome with webmcp extension..."
google-chrome \
  --no-sandbox \
  --disable-dev-shm-usage \
  --load-extension=/app/extension \
  --remote-debugging-port=9222 \
  "about:blank" &

echo "[sandbox] ready. Agent SSE endpoint: http://localhost:3000/sse"
echo "[sandbox] VNC: localhost:5900"

wait

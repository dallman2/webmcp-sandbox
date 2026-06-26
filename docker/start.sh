#!/bin/bash
set -e
trap 'kill 0' EXIT INT TERM

SANDBOX_TARGET_URL="${SANDBOX_TARGET_URL:-http://localhost:3000/fixtures/hello.html}"
SANDBOX_TARGET_HOST="${SANDBOX_TARGET_HOST:-}"

if [ -n "$SANDBOX_TARGET_HOST" ]; then
    SANDBOX_TARGET_URL="${SANDBOX_TARGET_URL/localhost/$SANDBOX_TARGET_HOST}"
    SANDBOX_TARGET_URL="${SANDBOX_TARGET_URL/127.0.0.1/$SANDBOX_TARGET_HOST}"
fi

export SANDBOX_TARGET_URL

echo "[sandbox] booting virtual display..."
Xvfb :99 -screen 0 1920x1080x24 &
XVFB_PID=$!

export DISPLAY=:99

echo "[sandbox] booting VNC (port 5900)..."
x11vnc -display :99 -forever -nopw -bg -rfbport 5900 2>/dev/null &
VNC_PID=$!

echo "[sandbox] starting MCP translation server (Streamable HTTP :3000, WS :8765)..."
/app/server &
SERVER_PID=$!

echo "[sandbox] waiting for MCP server readiness..."
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:3000/sandbox-config >/dev/null 2>&1; then
        echo "[sandbox] MCP server ready"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "[sandbox] ERROR: MCP server failed to start within 30s" >&2
        exit 1
    fi
    sleep 0.5
done

echo "[sandbox] launching Chromium with webmcp extension..."
chromium \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --load-extension=/app/extension \
    --remote-debugging-port=9222 \
    "$SANDBOX_TARGET_URL" &
CHROMIUM_PID=$!

echo "[sandbox] ready. Agent endpoint: http://localhost:3000/mcp"
echo "[sandbox] Config:   http://localhost:3000/sandbox-config"
echo "[sandbox] Fixtures: http://localhost:3000/fixtures/hello.html"
echo "[sandbox] VNC:      localhost:5900"
echo "[sandbox] CDP:      localhost:9222"
echo "[sandbox] Target:   $SANDBOX_TARGET_URL"

wait

#!/bin/bash
set -e

# Launch N sandbox containers on sequential ports targeting a web application.
# Each container gets its own headless Chromium + WebMCP extension + Streamable HTTP MCP endpoint.
#
# Usage:
#   ./scripts/launch-fleet.sh --count 5 --base-port 3001 --target http://host.docker.internal:8080
#   ./scripts/launch-fleet.sh -n 30 -p 3001 -t http://host.docker.internal:8080

COUNT=1
BASE_PORT=3001
TARGET_URL="http://host.docker.internal:8080"
IMAGE="webmcp-sandbox:latest"
CONTAINER_PREFIX="sandbox"
READINESS_TIMEOUT=60

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -n, --count N          Number of containers to launch (default: 1)"
  echo "  -p, --base-port PORT   First host port (default: 3001)"
  echo "  -t, --target URL       Target URL for sandbox Chrome (default: http://host.docker.internal:8080)"
  echo "  -i, --image IMAGE      Docker image (default: webmcp-sandbox:latest)"
  echo "  --prefix PREFIX        Container name prefix (default: sandbox)"
  echo "  --timeout SECS         Readiness timeout per container (default: 60)"
  echo "  -h, --help             Show this help"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--count) COUNT="$2"; shift 2 ;;
    -p|--base-port) BASE_PORT="$2"; shift 2 ;;
    -t|--target) TARGET_URL="$2"; shift 2 ;;
    -i|--image) IMAGE="$2"; shift 2 ;;
    --prefix) CONTAINER_PREFIX="$2"; shift 2 ;;
    --timeout) READINESS_TIMEOUT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

echo "[fleet] launching $COUNT sandbox containers (ports $BASE_PORT..$((BASE_PORT + COUNT - 1)))"
echo "[fleet] target: $TARGET_URL"
echo "[fleet] image: $IMAGE"

UNAME_S=$(uname -s)
EXTRA_ARGS=""
if [ "$UNAME_S" = "Darwin" ]; then
  EXTRA_ARGS="--add-host=host.docker.internal:host-gateway --add-host=admin.capx.local:host-gateway"
fi

for i in $(seq 0 $((COUNT - 1))); do
  PORT=$((BASE_PORT + i))
  NAME="${CONTAINER_PREFIX}-${i}"

  docker rm -f "$NAME" 2>/dev/null || true

  CONTAINER_TARGET="$TARGET_URL"
  if [ "$UNAME_S" = "Darwin" ]; then
    CONTAINER_TARGET="${CONTAINER_TARGET/localhost/host.docker.internal}"
    CONTAINER_TARGET="${CONTAINER_TARGET/127.0.0.1/host.docker.internal}"
  fi

  docker run -d --name "$NAME" \
    $EXTRA_ARGS \
    -p "${PORT}:3000" \
    -e "SANDBOX_TARGET_URL=${CONTAINER_TARGET}" \
    "$IMAGE" >/dev/null

  echo "[fleet] started $NAME on port $PORT"
done

echo "[fleet] waiting for readiness..."

READY=0
for i in $(seq 0 $((COUNT - 1))); do
  PORT=$((BASE_PORT + i))
  NAME="${CONTAINER_PREFIX}-${i}"

  for attempt in $(seq 1 $((READINESS_TIMEOUT * 2))); do
    if curl -sf "http://127.0.0.1:${PORT}/sandbox-config" >/dev/null 2>&1; then
      echo "[fleet] $NAME ready (port $PORT)"
      READY=$((READY + 1))
      break
    fi
    if [ "$attempt" -eq $((READINESS_TIMEOUT * 2)) ]; then
      echo "[fleet] WARNING: $NAME not ready after ${READINESS_TIMEOUT}s"
    fi
    sleep 0.5
  done
done

echo "[fleet] $READY/$COUNT containers ready"
echo "[fleet] port range: $BASE_PORT..$((BASE_PORT + COUNT - 1))"

if [ "$READY" -lt "$COUNT" ]; then
  echo "[fleet] some containers failed to start — check logs with: docker logs ${CONTAINER_PREFIX}-<N>"
  exit 1
fi

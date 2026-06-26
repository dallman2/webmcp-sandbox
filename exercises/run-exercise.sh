#!/bin/bash
set -e

TARGET="${1:-fixture}"
IMAGE="webmcp-sandbox"
CONTAINER="webmcp-sandbox-exercise"
OS="$(uname -s)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo -e "${YELLOW}[exercise] stopping container...${NC}"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [ "$TARGET" = "fixture" ]; then
  echo -e "${GREEN}[exercise] booting container with fixture target...${NC}"
  docker run -d --name "$CONTAINER" -p 3000:3000 -p 5900:5900 \
    -e SANDBOX_TARGET_URL=http://localhost:3000/fixtures/hello.html \
    "$IMAGE"
elif [ "$TARGET" = "host" ]; then
  echo -e "${GREEN}[exercise] booting container with host :8180 target...${NC}"
  if [ "$OS" = "Darwin" ]; then
    docker run -d --name "$CONTAINER" -p 3000:3000 -p 5900:5900 \
      --add-host=host.docker.internal:host-gateway \
      -e SANDBOX_TARGET_HOST=host.docker.internal \
      -e SANDBOX_TARGET_URL=http://localhost:8180/ \
      "$IMAGE"
  else
    docker run -d --name "$CONTAINER" --network=host \
      -e SANDBOX_TARGET_URL=http://localhost:8180/ \
      "$IMAGE"
  fi
else
  echo -e "${RED}Usage: $0 <fixture|host>${NC}"
  exit 2
fi

echo -e "${YELLOW}[exercise] waiting for container readiness...${NC}"
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3000/sandbox-config >/dev/null 2>&1; then
    echo -e "${GREEN}[exercise] container ready${NC}"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo -e "${RED}[exercise] ERROR: container failed to start within 30s${NC}"
    docker logs "$CONTAINER" | tail -20
    exit 1
  fi
  sleep 0.5
done

echo -e "${GREEN}[exercise] running smoke test --target ${TARGET}...${NC}"
cd "$SCRIPT_DIR"
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}[exercise] installing dependencies...${NC}"
  npm install --silent
fi
node smoke.mjs --target "$TARGET"
EXIT_CODE=$?

cleanup
trap - EXIT INT TERM

if [ $EXIT_CODE -ne 0 ]; then
  echo -e "${RED}[exercise] FAILED${NC}"
else
  echo -e "${GREEN}[exercise] SUCCESS${NC}"
fi
exit $EXIT_CODE

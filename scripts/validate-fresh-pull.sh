#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TEST_DIR="$REPO_ROOT/test"
CLONE_DIR="$TEST_DIR/clone"
LOGS_DIR="$TEST_DIR/logs"
IMAGE="webmcp-sandbox-validate"
CONTAINER="webmcp-sandbox-validate"
MCP_HOST_PORT=13000
VNC_HOST_PORT=15901
MCP_URL="http://localhost:$MCP_HOST_PORT/mcp"
VNC_ADDR="127.0.0.1:$VNC_HOST_PORT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PHASE=""
PASSED=true
VNC_OK=false
VNC_BANNER=""
CLONE_SHA=""
IMAGE_SHA=""
SUMMARY_FILE="$LOGS_DIR/summary.json"
START_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cleanup() {
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo -e "${YELLOW}[validate] tearing down container...${NC}"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  echo -e "${RED}[validate] FAILED at phase '$PHASE': $*${NC}"
  PASSED=false
}

log_phase() {
  PHASE="$1"
  echo ""
  echo -e "${GREEN}=== Phase: $PHASE ===${NC}"
}

step_ok()  { echo -e "  ${GREEN}[OK]${NC} $*"; }
step_fail() { echo -e "  ${RED}[FAIL]${NC} $*"; }

# ---------- setup ----------
log_phase "setup"
echo "[validate] repo root: $REPO_ROOT"

REMOTE=$(cd "$REPO_ROOT" && git config --get remote.origin.url 2>/dev/null) || REMOTE=""
if [ -z "$REMOTE" ]; then
  fail "no origin remote configured — cannot simulate fresh pull"
  exit 1
fi
echo "[validate] remote: $REMOTE"

rm -rf "$CLONE_DIR"
mkdir -p "$LOGS_DIR"
rm -rf "$LOGS_DIR"/*

step_ok "workspace ready: $TEST_DIR"

# ---------- fresh clone ----------
log_phase "fresh-clone"
echo "[validate] cloning $REMOTE into $CLONE_DIR..."
git clone --depth 1 "$REMOTE" "$CLONE_DIR"
CLONE_SHA=$(cd "$CLONE_DIR" && git rev-parse HEAD)
step_ok "cloned $CLONE_SHA"

# ---------- image build ----------
log_phase "image-build"
echo "[validate] building $IMAGE from cloned repo..."
docker build -f "$CLONE_DIR/docker/Dockerfile" -t "$IMAGE" "$CLONE_DIR"
IMAGE_SHA=$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null | cut -d: -f2 | cut -c1-12)
step_ok "image $IMAGE_SHA built"

# ---------- container boot ----------
log_phase "container-boot"
echo "[validate] booting $CONTAINER (MCP :$MCP_HOST_PORT, VNC :$VNC_HOST_PORT)..."
docker run -d --name "$CONTAINER" \
  -p "$MCP_HOST_PORT:3000" -p "$VNC_HOST_PORT:5900" \
  -e SANDBOX_TARGET_URL=http://localhost:3000/fixtures/hello.html \
  "$IMAGE"
step_ok "container started"

# ---------- MCP readiness ----------
log_phase "mcp-readiness"
echo "[validate] waiting for MCP server on :$MCP_HOST_PORT..."
READY=false
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$MCP_HOST_PORT/sandbox-config" >/dev/null 2>&1; then
    step_ok "MCP server ready (attempt $i)"
    READY=true
    break
  fi
  if [ "$i" -eq 60 ]; then
    fail "MCP server not ready within 30s"
    docker logs "$CONTAINER" > "$LOGS_DIR/container.log" 2>&1
  fi
  sleep 0.5
done
if ! $READY; then exit 1; fi

# ---------- VNC probe ----------
log_phase "vnc-probe"
echo "[validate] probing VNC RFB handshake on $VNC_ADDR..."
VNC_BANNER=$(python3 -c "
import socket, sys
s = socket.socket()
s.settimeout(5.0)
try:
    s.connect(('127.0.0.1', $VNC_HOST_PORT))
    banner = s.recv(12)
    s.close()
    print(repr(banner))
except Exception as e:
    print('ERROR:' + str(e), file=sys.stderr)
    sys.exit(1)
" 2>&1) || VNC_BANNER="ERROR: python3 VNC probe failed"

if [[ "$VNC_BANNER" == *RFB* ]]; then
  VNC_OK=true
  step_ok "VNC banner: $VNC_BANNER"
else
  step_fail "VNC banner unexpected: $VNC_BANNER"
  PASSED=false
fi

# ---------- smoke test ----------
log_phase "smoke-test"
echo "[validate] installing dependencies in clone..."
npm --prefix "$CLONE_DIR/exercises" install --silent

echo "[validate] running smoke.mjs --target fixture..."
SMOKE_STDOUT=$(mktemp)
set +e
MCP_URL="$MCP_URL" node "$CLONE_DIR/exercises/smoke.mjs" --target fixture > "$SMOKE_STDOUT" 2>&1
SMOKE_EXIT=$?
set -e
cat "$SMOKE_STDOUT"
echo ""

SMOKE_ALL_PASSED=false
if [ "$SMOKE_EXIT" -eq 0 ] && grep -q 'ALL PASSED' "$SMOKE_STDOUT"; then
  SMOKE_ALL_PASSED=true
fi

if $SMOKE_ALL_PASSED; then
  step_ok "smoke test all passed"
else
  step_fail "smoke test failed (exit=$SMOKE_EXIT)"
  PASSED=false
fi
rm -f "$SMOKE_STDOUT"

# ---------- capture artifacts ----------
log_phase "artifacts"
echo "[validate] capturing container logs..."
docker logs "$CONTAINER" > "$LOGS_DIR/container.log" 2>&1

if compgen -G "$CLONE_DIR/exercises/output/*.json" >/dev/null 2>&1; then
  cp "$CLONE_DIR/exercises/output"/*.json "$LOGS_DIR/" 2>/dev/null || true
  echo "[validate] captured smoke transcripts"
fi

cat > "$SUMMARY_FILE" <<JSONHEREDOC
{
  "remote": "$REMOTE",
  "cloneSha": "$CLONE_SHA",
  "imageSha": "$IMAGE_SHA",
  "vncBanner": "$VNC_BANNER",
  "vncOk": $VNC_OK,
  "passed": $PASSED,
  "startTime": "$START_TIME",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSONHEREDOC

step_ok "artifacts written to $LOGS_DIR"

# ---------- report ----------
echo ""
if $PASSED; then
  echo -e "${GREEN}=== VALIDATION PASSED ===${NC}"
  echo "Summary: $SUMMARY_FILE"
  echo "Logs:    $LOGS_DIR/container.log"
  echo "Clone:   $REMOTE @ $CLONE_SHA"
  echo "VNC:     $VNC_BANNER"
  echo "Image:   $IMAGE_SHA"
else
  echo -e "${RED}=== VALIDATION FAILED ===${NC}"
  echo "Summary: $SUMMARY_FILE"
  echo "Logs:    $LOGS_DIR/container.log"
fi

if $PASSED; then exit 0; else exit 1; fi

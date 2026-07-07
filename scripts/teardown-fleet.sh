#!/bin/bash
set -e

# Stop and remove all sandbox fleet containers.
#
# Usage:
#   ./scripts/teardown-fleet.sh
#   ./scripts/teardown-fleet.sh --prefix sandbox

CONTAINER_PREFIX="sandbox"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) CONTAINER_PREFIX="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--prefix PREFIX]"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

CONTAINERS=$(docker ps -a --filter "name=^${CONTAINER_PREFIX}-" --format "{{.Names}}" 2>/dev/null || true)

if [ -z "$CONTAINERS" ]; then
  echo "[fleet] no ${CONTAINER_PREFIX}-* containers found"
  exit 0
fi

COUNT=$(echo "$CONTAINERS" | wc -l | tr -d ' ')
echo "[fleet] stopping $COUNT containers..."

echo "$CONTAINERS" | xargs docker rm -f >/dev/null 2>&1

echo "[fleet] removed $COUNT containers"

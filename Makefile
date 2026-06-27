IMAGE := webmcp-sandbox
CONTAINER := webmcp-sandbox
DOCKERFILE := docker/Dockerfile
MCP_PORT := 3000
VNC_PORT := 5901

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
  HOST_NETWORK := --add-host=host.docker.internal:host-gateway
  HOST_ENV := -e SANDBOX_TARGET_HOST=host.docker.internal
  HOST_PORT_MAP := -p $(MCP_PORT):$(MCP_PORT)
else
  HOST_NETWORK := --network=host
  HOST_ENV :=
  HOST_PORT_MAP :=
endif

.PHONY: build run run-fixture run-smoke run-host smoke smoke-fixture smoke-host publish clean validate

build:
	docker build -f $(DOCKERFILE) -t $(IMAGE) .

run: build
	docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
		-p $(MCP_PORT):$(MCP_PORT) -p $(VNC_PORT):5900 \
		-e SANDBOX_TARGET_URL=http://localhost:3000/fixtures/hello.html \
		$(IMAGE)
	@echo "[make] container running on :$(MCP_PORT) (VNC :$(VNC_PORT))"

run-fixture: build
	docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
		-p $(MCP_PORT):$(MCP_PORT) -p $(VNC_PORT):5900 \
		-e SANDBOX_TARGET_URL=http://localhost:3000/fixtures/hello.html \
		$(IMAGE)
	@echo "[make] fixture container running"

run-smoke: build
	docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
		-p $(MCP_PORT):$(MCP_PORT) \
		-e SANDBOX_TARGET_URL=http://localhost:3000/fixtures/hello.html \
		$(IMAGE)
	@echo "[make] smoke container running"

run-host: build
	docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
		$(HOST_NETWORK) \
		$(HOST_PORT_MAP) \
		$(HOST_ENV) \
		-e SANDBOX_TARGET_URL=http://localhost:8180/ \
		$(IMAGE)
	@echo "[make] host container running (target: localhost:8180)"

smoke:
	cd exercises && node smoke.mjs --target fixture

smoke-fixture: run-smoke
	@trap '$(MAKE) clean' EXIT; \
	echo "[make] waiting for sandbox readiness ($(MCP_PORT))..." && \
	for i in $$(seq 1 60); do \
		curl -sf http://127.0.0.1:$(MCP_PORT)/sandbox-config >/dev/null 2>&1 && { echo "[make] sandbox ready"; break; }; \
		if [ $$i -eq 60 ]; then echo "[make] ERROR: sandbox not ready within 30s"; exit 1; fi; \
		sleep 0.5; \
	done && \
	echo "[make] running smoke..." && \
	[ -d exercises/node_modules ] || npm --prefix exercises install --silent && \
	node exercises/smoke.mjs --target fixture

smoke-host: build
	docker rm -f $(CONTAINER) 2>/dev/null || true
	docker run -d --name $(CONTAINER) \
		$(HOST_NETWORK) \
		$(HOST_PORT_MAP) \
		$(HOST_ENV) \
		-e SANDBOX_TARGET_URL=http://localhost:8180/ \
		$(IMAGE)
	@echo "[make] smoke-host: running smoke..." && \
	trap '$(MAKE) clean' EXIT; \
	for i in $$(seq 1 60); do \
		curl -sf http://127.0.0.1:$(MCP_PORT)/sandbox-config >/dev/null 2>&1 && { echo "[make] sandbox ready"; break; }; \
		if [ $$i -eq 60 ]; then echo "[make] ERROR: sandbox not ready within 30s"; exit 1; fi; \
		sleep 0.5; \
	done && \
	[ -d exercises/node_modules ] || npm --prefix exercises install --silent && \
	node exercises/smoke.mjs --target host

publish:
	@echo "To publish to GHCR:"
	@echo "  1. Set GHCR_TOKEN secret in GitHub repo settings"
	@echo "  2. Trigger workflow: gh workflow run docker-publish.yml"

clean:
	docker rm -f $(CONTAINER) 2>/dev/null || true

validate:
	bash scripts/validate-fresh-pull.sh

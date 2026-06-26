FROM rust:1-bookworm AS rust-builder
WORKDIR /build
COPY mcp-server/ .
RUN cargo build --release

FROM node:22-bookworm AS ext-builder
WORKDIR /build
COPY webmcp-extension/package.json ./
RUN npm install
COPY webmcp-extension/ .
RUN npm run build

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    wget gnupg xvfb x11vnc libx11-xcb1 libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
    chromium-browser \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rust-builder /build/target/release/webmcp-sandbox ./server
COPY --from=ext-builder /build/.output/chrome-mv3 ./extension

COPY docker/start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000 5900

CMD ["./start.sh"]

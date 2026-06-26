use std::net::SocketAddr;

use anyhow::Result;
use axum::{routing::get, Router};
use clap::Parser;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "webmcp-sandbox")]
struct Args {
    #[arg(long, default_value = "sse")]
    transport: String,

    #[arg(long, default_value = "3000")]
    port: u16,
}

async fn sse_handler() -> axum::response::Sse<impl futures_core::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>> {
    use axum::response::sse::Event;
    use futures_util::stream;

    let stream = stream::iter(vec![
        Ok::<_, std::convert::Infallible>(Event::default()
            .data(serde_json::json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "note": "WebMCP Sandbox MCP server — stub SSE endpoint. Real rmcp wiring pending Sprint 1."
            }).to_string()))
    ]);

    axum::response::Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    )
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    let args = Args::parse();
    let addr: SocketAddr = format!("0.0.0.0:{}", args.port).parse()?;

    info!("WebMCP Sandbox MCP server stub starting on {}", addr);
    info!("SSE endpoint: http://localhost:{}/sse", args.port);
    info!("All logging directed to stderr — stdout is reserved for JSON-RPC");

    let app = Router::new().route("/sse", get(sse_handler));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

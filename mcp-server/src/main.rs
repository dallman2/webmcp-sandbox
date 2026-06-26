use std::net::SocketAddr;

use anyhow::Result;
use clap::Parser;
use rmcp::transport::sse_server::SseServerConfig;
use serde::{Deserialize, Serialize};
use tracing::info;
use tracing_subscriber::EnvFilter;

mod tools;

#[derive(Parser, Debug)]
#[command(name = "webmcp-sandbox")]
struct Args {
    #[arg(long, default_value = "sse")]
    transport: String,

    #[arg(long, default_value = "3000")]
    port: u16,
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

    info!("Starting WebMCP Sandbox MCP server on {}", addr);

    let config = SseServerConfig {
        bind: addr,
        ..Default::default()
    };

    let (serve_io, _) = tools::serve(config).await?;

    serve_io.wait_ctrl_c().await?;
    info!("Shutdown complete");
    Ok(())
}

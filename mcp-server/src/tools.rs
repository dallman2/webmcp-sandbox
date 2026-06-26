use rmcp::transport::sse_server::{SseServer, SseServerConfig};
use rmcp::Server;
use serde::{Deserialize, Serialize};

pub async fn serve(config: SseServerConfig) -> anyhow::Result<(SseServer, tokio::task::JoinHandle<()>)> {
    let server = Server::new(
        "webmcp-sandbox".into(),
        env!("CARGO_PKG_VERSION").into(),
    )
    .register_tool(DiscoverTools)
    .register_tool(GetPageState);

    let service = server.serve();

    let (sse, handle) = SseServer::new(config, service).await?;

    Ok((sse, handle))
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct DiscoverTools;

#[rmcp::tool]
impl DiscoverTools {
    #[tool(description = "List all tools currently available on the connected browser page")]
    async fn execute(&self) -> String {
        serde_json::to_string_pretty(&serde_json::json!({
            "tools": [
                {"name": "discover_tools", "description": "List all tools available on the page"},
                {"name": "get_page_state", "description": "Get the current page URL and title"}
            ],
            "note": "Stub — full discovery from browser relay pending Sprint 1"
        }))
        .unwrap_or_default()
    }
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct GetPageState;

#[rmcp::tool]
impl GetPageState {
    #[tool(description = "Get the current page URL and title from the connected browser")]
    async fn execute(&self) -> String {
        serde_json::to_string_pretty(&serde_json::json!({
            "url": "about:blank",
            "title": "WebMCP Sandbox",
            "note": "Stub — real page state relay pending Sprint 1"
        }))
        .unwrap_or_default()
    }
}

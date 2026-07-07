use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Json,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use schemars::JsonSchema;
use serde::Deserialize;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use tower_http::services::ServeDir;

struct ExtensionRequest {
    payload: String,
}

#[derive(Clone)]
pub struct AppState {
    extension_tx: Arc<Mutex<Option<mpsc::UnboundedSender<ExtensionRequest>>>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
    ws_session_id: Arc<String>,
}

impl AppState {
    fn new() -> Self {
        Self {
            extension_tx: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            ws_session_id: Arc::new(Uuid::new_v4().to_string()),
        }
    }

    async fn relay_to_extension(
        &self,
        msg_type: &str,
        extra: Option<serde_json::Value>,
        tool_name: &str,
    ) -> Result<serde_json::Value, String> {
        let id = Uuid::new_v4().to_string();

        info!(
            correlation_id = %id,
            tool_name = %tool_name,
            ws_session_id = %self.ws_session_id,
            msg_type = %msg_type,
            "relaying to browser extension"
        );

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);

        let mut payload = serde_json::json!({ "type": msg_type, "id": id });
        if let Some(extra) = extra {
            if let serde_json::Value::Object(ref mut map) = payload {
                if let serde_json::Value::Object(extras) = extra {
                    map.extend(extras);
                    payload = serde_json::Value::Object(map.clone());
                }
            }
        }

        let payload_str = payload.to_string();
        let ext_tx_guard = self.extension_tx.lock().await;
        match ext_tx_guard.as_ref() {
            Some(tx) => {
                let _ = tx.send(ExtensionRequest {
                    payload: payload_str,
                });
            }
            None => {
                drop(ext_tx_guard);
                self.pending.lock().await.remove(&id);
                return Err("no browser extension connected".to_string());
            }
        }
        drop(ext_tx_guard);

        match tokio::time::timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(response)) => {
                let parsed: serde_json::Value = serde_json::from_str(&response)
                    .map_err(|e| format!("failed to parse extension response: {}", e))?;
                Ok(parsed)
            }
            Ok(Err(_)) => Err("browser extension disconnected before response".to_string()),
            Err(_elapsed) => {
                self.pending.lock().await.remove(&id);
                Err("extension relay timeout (30s)".to_string())
            }
        }
    }
}

#[derive(Clone)]
struct McpHandler {
    state: Arc<AppState>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct ExecuteToolInput {
    #[schemars(description = "The name of the tool to execute on the page")]
    pub tool_name: String,
    #[schemars(description = "JSON-encoded arguments for the tool")]
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub struct NavigatePageInput {
    #[schemars(description = "The full URL to navigate the browser to")]
    pub url: String,
}

#[rmcp::tool_router(server_handler)]
impl McpHandler {
    #[rmcp::tool(
        description = "Discover available tools on the current page through the browser extension"
    )]
    async fn discover_tools(&self) -> Result<model::CallToolResult, rmcp::ErrorData> {
        match self
            .state
            .relay_to_extension("discover_tools", None, "discover_tools")
            .await
        {
            Ok(result) => {
                let tools = result.get("tools").cloned().unwrap_or_default();
                let text = serde_json::to_string_pretty(&tools).unwrap_or_default();
                Ok(model::CallToolResult::success(vec![model::Content::text(
                    text,
                )]))
            }
            Err(e) => Ok(model::CallToolResult::error(vec![model::Content::text(e)])),
        }
    }

    #[rmcp::tool(
        description = "Execute a named tool on the current page through the browser extension"
    )]
    async fn execute_tool(
        &self,
        input: Parameters<ExecuteToolInput>,
    ) -> Result<model::CallToolResult, rmcp::ErrorData> {
        let args = input.0;
        let extra = serde_json::json!({
            "toolName": args.tool_name,
            "args": args.args,
        });
        match self
            .state
            .relay_to_extension("call_tool", Some(extra), "execute_tool")
            .await
        {
            Ok(result) => {
                let text = serde_json::to_string_pretty(&result).unwrap_or_default();
                Ok(model::CallToolResult::success(vec![model::Content::text(
                    text,
                )]))
            }
            Err(e) => Ok(model::CallToolResult::error(vec![model::Content::text(e)])),
        }
    }

    #[rmcp::tool(
        description = "Navigate the browser to a new URL. Use for full page navigation (e.g., going to the login page or a different section of the app)."
    )]
    async fn navigate_page(
        &self,
        input: Parameters<NavigatePageInput>,
    ) -> Result<model::CallToolResult, rmcp::ErrorData> {
        let extra = serde_json::json!({ "url": input.0.url });
        match self
            .state
            .relay_to_extension("navigate", Some(extra), "navigate_page")
            .await
        {
            Ok(result) => {
                let text = serde_json::to_string_pretty(&result).unwrap_or_default();
                Ok(model::CallToolResult::success(vec![model::Content::text(
                    text,
                )]))
            }
            Err(e) => Ok(model::CallToolResult::error(vec![model::Content::text(e)])),
        }
    }
}

async fn extension_ws_task(ws: WebSocket, state: Arc<AppState>) {
    info!(
        ws_session_id = %state.ws_session_id,
        "browser extension connected over WebSocket"
    );

    let (mut ws_sender, mut ws_receiver) = ws.split();
    let (req_tx, mut req_rx) = mpsc::unbounded_channel::<ExtensionRequest>();
    let keepalive_tx = req_tx.clone();

    {
        let mut ext_tx = state.extension_tx.lock().await;
        *ext_tx = Some(req_tx);
    }

    let send_task = {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(20));
            loop {
                tokio::select! {
                    req = req_rx.recv() => {
                        match req {
                            Some(req) => {
                                if ws_sender.send(Message::Text(req.payload.into())).await.is_err() {
                                    break;
                                }
                            }
                            None => break,
                        }
                    }
                    _ = interval.tick() => {
                        let ping = serde_json::json!({
                            "type": "ping",
                            "id": Uuid::new_v4().to_string(),
                        });
                        if ws_sender.send(Message::Text(ping.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
        })
    };

    drop(keepalive_tx);

    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let text_str = text.to_string();
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text_str) {
                    let msg_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if msg_type == "pong" {
                        continue;
                    }
                    if let Some(response_id) = value.get("id").and_then(|v| v.as_str()) {
                        let mut pending = state.pending.lock().await;
                        if let Some(tx) = pending.remove(response_id) {
                            info!(
                                correlation_id = %response_id,
                                msg_type = %msg_type,
                                ws_session_id = %state.ws_session_id,
                                "received response from extension"
                            );
                            let _ = tx.send(text_str);
                        } else if msg_type != "pong" && msg_type != "ping" {
                            warn!(correlation_id = %response_id, "no pending request for response id");
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                warn!("WS receive error: {}", e);
                break;
            }
            _ => {}
        }
    }

    send_task.abort();

    {
        let mut ext_tx = state.extension_tx.lock().await;
        *ext_tx = None;
    }

    info!(ws_session_id = %state.ws_session_id, "browser extension disconnected");
}

async fn handle_extension_ws(
    ws: WebSocketUpgrade,
    state: axum::extract::State<Arc<AppState>>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |ws| extension_ws_task(ws, state.0))
}

async fn sandbox_config_handler() -> Json<serde_json::Value> {
    let target_url = std::env::var("SANDBOX_TARGET_URL")
        .unwrap_or_else(|_| "http://localhost:3000/fixtures/hello.html".to_string());
    let target_origin = extract_origin(&target_url);
    Json(serde_json::json!({
        "wsUrl": "ws://127.0.0.1:8765",
        "targetUrl": target_url,
        "targetOrigin": target_origin,
    }))
}

fn extract_origin(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("http://") {
        let host_end = rest.find('/').unwrap_or(rest.len());
        format!("http://{}", &rest[..host_end])
    } else if let Some(rest) = url.strip_prefix("https://") {
        let host_end = rest.find('/').unwrap_or(rest.len());
        format!("https://{}", &rest[..host_end])
    } else {
        "http://localhost".to_string()
    }
}



#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    info!("WebMCP Sandbox MCP server starting (Streamable HTTP transport)");
    info!("All logging directed to stderr — stdout is reserved for JSON-RPC");
    info!("Structured logging fields: correlation_id, tool_name, ws_session_id");

    let state = Arc::new(AppState::new());

    let session_manager = Arc::new(LocalSessionManager::default());
    let config = StreamableHttpServerConfig::default();

    let mcp_service = StreamableHttpService::new(
        {
            let state = state.clone();
            move ||                 Ok::<_, std::io::Error>(McpHandler {
                state: state.clone(),
            })
        },
        session_manager,
        config,
    );

    let mcp_app = Router::new()
        .route("/sandbox-config", get(sandbox_config_handler))
        .nest_service("/fixtures", ServeDir::new("./fixtures"))
        .route_service("/mcp", mcp_service);

    let ws_app = Router::new()
        .route(
            "/",
            get(
                |ws: WebSocketUpgrade, state: axum::extract::State<Arc<AppState>>| async move {
                    handle_extension_ws(ws, state).await
                },
            ),
        )
        .with_state(state);

    let mcp_addr: SocketAddr = "0.0.0.0:3000".parse()?;
    let ws_addr: SocketAddr = "0.0.0.0:8765".parse()?;

    info!("MCP Streamable HTTP endpoint: http://localhost:3000/mcp");
    info!("Extension WS endpoint: ws://0.0.0.0:8765");

    let mcp_listener = tokio::net::TcpListener::bind(mcp_addr).await?;
    let ws_listener = tokio::net::TcpListener::bind(ws_addr).await?;

    tokio::select! {
        res = axum::serve(mcp_listener, mcp_app) => {
            if let Err(e) = res { warn!("MCP server exited: {}", e); }
        }
        res = axum::serve(ws_listener, ws_app) => {
            if let Err(e) = res { warn!("WS server exited: {}", e); }
        }
    }

    Ok(())
}

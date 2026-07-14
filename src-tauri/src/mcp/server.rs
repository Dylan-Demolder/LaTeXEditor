use crate::mcp::protocol::*;
use crate::mcp::tools;
use axum::{
    extract::State,
    http::StatusCode,
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde_json::Value;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};

pub type SharedState = Arc<McpState>;

pub async fn start_server(port: u16, state: SharedState) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/mcp", post(handle_mcp_post))
        .route("/mcp/sse", get(handle_mcp_sse))
        .layer(cors)
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    log::info!("MCP server starting on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn handle_mcp_post(
    State(state): State<SharedState>,
    Json(request): Json<JsonRpcRequest>,
) -> Result<Json<JsonRpcResponse>, StatusCode> {
    let response = match request.method.as_str() {
        "initialize" => handle_initialize(&request),
        "tools/list" => handle_list_tools(&request),
        "tools/call" => handle_call_tool(&request, state).await,
        "notifications/initialized" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id.clone(),
            result: Some(Value::Null),
            error: None,
        },
        _ => error_response(request.id.clone(), -32601, &format!("Method not found: {}", request.method)),
    };

    Ok(Json(response))
}

async fn handle_mcp_sse(
    State(_state): State<SharedState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, _rx) = tokio::sync::broadcast::channel::<String>(16);
    let stream = BroadcastStream::new(tx.subscribe()).map(|msg| {
        match msg {
            Ok(data) => Ok(Event::default().data(data)),
            Err(_) => Ok(Event::default().data("")),
        }
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

fn handle_initialize(request: &JsonRpcRequest) -> JsonRpcResponse {
    let result = serde_json::to_value(InitializeResult {
        protocol_version: "2024-11-05".to_string(),
        capabilities: ServerCapabilities {
            tools: Some(ToolsCapability {
                list_changed: Some(false),
            }),
            resources: Some(ResourcesCapability {
                subscribe: Some(false),
                list_changed: Some(false),
            }),
        },
        server_info: ServerInfo {
            name: "LaTeXEditor MCP Server".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
    })
    .unwrap();

    ok_response(request.id.clone(), result)
}

fn handle_list_tools(request: &JsonRpcRequest) -> JsonRpcResponse {
    let tools = tools::get_tools();
    let result = serde_json::to_value(ListToolsResult { tools }).unwrap();
    ok_response(request.id.clone(), result)
}

async fn handle_call_tool(request: &JsonRpcRequest, state: SharedState) -> JsonRpcResponse {
    let params: Option<CallToolParams> = request
        .params
        .as_ref()
        .and_then(|p| serde_json::from_value(p.clone()).ok());

    match params {
        Some(p) => {
            let result = tools::call_tool(&p.name, p.arguments, state.project_path.clone()).await;
            let val = serde_json::to_value(result).unwrap_or(Value::Null);
            ok_response(request.id.clone(), val)
        }
        None => error_response(
            request.id.clone(),
            -32602,
            "Invalid params: expected { name, arguments }",
        ),
    }
}

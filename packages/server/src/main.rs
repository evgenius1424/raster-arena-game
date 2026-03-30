#![forbid(unsafe_code)]
#![deny(rust_2018_idioms)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::panic)]

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex};
use tracing::{error, info, warn};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::setting_engine::SettingEngine;
use webrtc::api::APIBuilder;
use webrtc::ice::mdns::MulticastDnsMode;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::ice_transport::ice_credential_type::RTCIceCredentialType;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

mod binary;
mod constants;
mod game;
mod map;
mod physics;
mod room;
mod room_manager;

use crate::binary::{decode_client_message, encode_pong, encode_welcome, ClientMsg};
use crate::constants::{
    DEFAULT_MAP_DIR, DEFAULT_MAP_NAME, DEFAULT_PORT, DEFAULT_ROOM_ID, OUTBOUND_CHANNEL_CAPACITY,
    ROOM_COMMAND_CAPACITY,
};
use crate::game::WeaponId;
use crate::map::GameMap;
use crate::room::{PlayerId, PlayerInput, RoomConfig, RoomHandle};
use crate::room_manager::RoomManager;

struct AppState {
    room_manager: Arc<RoomManager>,
    next_player_id: AtomicU64,
    map_dir: PathBuf,
    started_at: Instant,
    max_connections_per_ip: usize,
    max_message_bytes: usize,
    max_players_per_room: usize,
    ip_connections: tokio::sync::Mutex<HashMap<IpAddr, usize>>,
    game_secret: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TicketClaims {
    room_id: String,
    #[allow(dead_code)]
    session_id: String,
    exp: u64,
}

#[derive(Debug, Deserialize)]
struct RtcQuery {
    ticket: Option<String>,
}

enum RtcCmd {
    Client(ClientMsg),
    Shutdown,
}

#[derive(Debug, Deserialize)]
struct RtcSignalIn {
    #[serde(rename = "type")]
    msg_type: String,
    sdp: Option<String>,
}

#[derive(Debug, Serialize)]
struct RtcSignalOut {
    #[serde(rename = "type")]
    msg_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sdp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}


#[tokio::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let map_dir = std::env::var("MAP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_MAP_DIR));

    let max_connections_per_ip: usize = std::env::var("MAX_CONNECTIONS_PER_IP")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);
    let max_rooms: usize = std::env::var("MAX_ROOMS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(50);
    let max_players_per_room: usize = std::env::var("MAX_PLAYERS_PER_ROOM")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8);
    let max_message_bytes: usize = std::env::var("MAX_MESSAGE_BYTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(65536);

    let game_secret = std::env::var("GAME_SECRET").ok().filter(|s| !s.is_empty());
    if game_secret.is_some() {
        info!("GAME_SECRET configured: ticket validation enabled for /rtc");
    } else {
        info!("GAME_SECRET not set: /rtc open to all connections");
    }

    let state = Arc::new(AppState {
        room_manager: Arc::new(RoomManager::new(
            Instant::now(),
            max_rooms,
            max_players_per_room,
        )),
        next_player_id: AtomicU64::new(1),
        map_dir,
        started_at: Instant::now(),
        max_connections_per_ip,
        max_message_bytes,
        max_players_per_room,
        ip_connections: tokio::sync::Mutex::new(HashMap::new()),
        game_secret,
    });

    let app = Router::new()
        .route("/rtc", get(rtc_ws_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_PORT.to_string());
    let addr = format!("0.0.0.0:{port}");
    info!("listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .tcp_nodelay(true)
    .await
}


async fn rtc_ws_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
    Query(query): Query<RtcQuery>,
    ws: WebSocketUpgrade,
) -> axum::response::Response {
    let claimed_room_id = if let Some(secret) = &state.game_secret {
        let Some(ticket) = &query.ticket else {
            return StatusCode::UNAUTHORIZED.into_response();
        };
        match verify_game_ticket(ticket, secret) {
            Some(c) => Some(c.room_id),
            None => return StatusCode::UNAUTHORIZED.into_response(),
        }
    } else {
        None
    };

    let client_ip = addr.ip();
    ws.on_upgrade(move |socket| handle_rtc_socket(state, socket, client_ip, claimed_room_id))
        .into_response()
}

fn verify_game_ticket(token: &str, secret: &str) -> Option<TicketClaims> {
    use base64::Engine as _;
    use hmac::Mac as _;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;

    let mut parts = token.splitn(2, '.');
    let encoded = parts.next()?;
    let sig_b64 = parts.next()?;

    let sig_bytes = engine.decode(sig_b64).ok()?;

    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(encoded.as_bytes());
    mac.verify_slice(&sig_bytes).ok()?;

    let payload_bytes = engine.decode(encoded).ok()?;
    let claims: TicketClaims = serde_json::from_slice(&payload_bytes).ok()?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    // Allow 5s clock skew between Express and Rust clocks
    if claims.exp + 5_000 < now_ms {
        return None;
    }

    Some(claims)
}

/// Outer handler: enforces per-IP connection limit, then delegates to inner.
async fn handle_rtc_socket(state: Arc<AppState>, socket: WebSocket, client_ip: IpAddr, claimed_room_id: Option<String>) {
    {
        let mut ip_conns = state.ip_connections.lock().await;
        let count = ip_conns.entry(client_ip).or_insert(0);
        if *count >= state.max_connections_per_ip {
            warn!(
                %client_ip,
                limit = state.max_connections_per_ip,
                "connection rejected: per-IP limit reached"
            );
            return;
        }
        *count += 1;
    }

    handle_rtc_socket_inner(Arc::clone(&state), socket, claimed_room_id).await;

    {
        let mut ip_conns = state.ip_connections.lock().await;
        if let Some(count) = ip_conns.get_mut(&client_ip) {
            if *count <= 1 {
                ip_conns.remove(&client_ip);
            } else {
                *count -= 1;
            }
        }
    }
}

async fn handle_rtc_socket_inner(state: Arc<AppState>, socket: WebSocket, claimed_room_id: Option<String>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let Some(Ok(Message::Text(offer_text))) = ws_receiver.next().await else {
        return;
    };

    let signal: RtcSignalIn = match serde_json::from_str(&offer_text) {
        Ok(v) => v,
        Err(err) => {
            let payload = serde_json::to_string(&RtcSignalOut {
                msg_type: "error",
                sdp: None,
                message: Some(format!("invalid rtc signal: {err}")),
            })
            .unwrap_or_else(|_| {
                "{\"type\":\"error\",\"message\":\"invalid rtc signal\"}".to_string()
            });
            let _ = ws_sender.send(Message::Text(payload)).await;
            return;
        }
    };

    if signal.msg_type != "offer" || signal.sdp.is_none() {
        let _ = ws_sender
            .send(Message::Text(
                serde_json::to_string(&RtcSignalOut {
                    msg_type: "error",
                    sdp: None,
                    message: Some("expected offer with sdp".to_string()),
                })
                .unwrap_or_else(|_| {
                    "{\"type\":\"error\",\"message\":\"expected offer\"}".to_string()
                }),
            ))
            .await;
        return;
    }

    let mut media_engine = MediaEngine::default();
    if media_engine.register_default_codecs().is_err() {
        return;
    }
    let mut registry = webrtc::interceptor::registry::Registry::new();
    registry = match register_default_interceptors(registry, &mut media_engine) {
        Ok(v) => v,
        Err(_) => return,
    };

    let mut setting_engine = SettingEngine::default();
    setting_engine.set_ice_multicast_dns_mode(MulticastDnsMode::Disabled);

    let api = APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_setting_engine(setting_engine)
        .build();

    let mut ice_servers = vec![RTCIceServer {
        urls: vec!["stun:stun.l.google.com:19302".to_string()],
        ..Default::default()
    }];
    if let Some(turn_server) = load_turn_server() {
        ice_servers.push(turn_server);
    }
    let config = RTCConfiguration {
        ice_servers,
        ..Default::default()
    };

    let peer_connection = match api.new_peer_connection(config).await {
        Ok(pc) => Arc::new(pc),
        Err(_) => return,
    };
    let (pc_closed_tx, mut pc_closed_rx) = mpsc::channel::<()>(1);

    let (game_outbound_tx, game_outbound_rx) = mpsc::channel::<Bytes>(OUTBOUND_CHANNEL_CAPACITY);
    let game_outbound_rx = Arc::new(Mutex::new(Some(game_outbound_rx)));
    let (rtc_cmd_tx, mut rtc_cmd_rx) = mpsc::channel::<RtcCmd>(ROOM_COMMAND_CAPACITY);

    let player_id = PlayerId(state.next_player_id.fetch_add(1, Ordering::Relaxed));
    let state_for_session = Arc::clone(&state);
    let game_outbound_tx_for_session = game_outbound_tx.clone();
    let session_task = tokio::spawn(async move {
        let mut current_room: Option<Arc<RoomHandle>> = None;
        let mut username = format!("player{}", player_id.0);

        while let Some(cmd) = rtc_cmd_rx.recv().await {
            match cmd {
                RtcCmd::Client(client_msg) => {
                    let keep_running = handle_client_msg(
                        &state_for_session,
                        &mut current_room,
                        &mut username,
                        player_id,
                        client_msg,
                        &game_outbound_tx_for_session,
                        claimed_room_id.as_deref(),
                    )
                    .await;
                    if !keep_running {
                        break;
                    }
                }
                RtcCmd::Shutdown => break,
            }
        }

        if let Some(room) = current_room.take() {
            room.leave(player_id);
        }
    });

    peer_connection.on_peer_connection_state_change(Box::new(move |state| {
        let pc_closed_tx2 = pc_closed_tx.clone();
        Box::pin(async move {
            if matches!(
                state,
                RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
            ) {
                let _ = pc_closed_tx2.try_send(());
            }
        })
    }));

    let max_message_bytes = state.max_message_bytes;
    let game_outbound_rx_for_dc = Arc::clone(&game_outbound_rx);
    let rtc_cmd_tx_for_dc = rtc_cmd_tx.clone();
    peer_connection.on_data_channel(Box::new(move |dc| {
        let label = dc.label().to_string();
        if label != "control" && label != "game" {
            return Box::pin(async {});
        }
        let game_outbound_rx_for_msg = Arc::clone(&game_outbound_rx_for_dc);
        let rtc_cmd_tx_for_msg = rtc_cmd_tx_for_dc.clone();

        Box::pin(async move {
            if label == "control" {
                let dc_for_open = Arc::clone(&dc);
                dc.on_open(Box::new(move || {
                    let dc_for_open2 = Arc::clone(&dc_for_open);
                    Box::pin(async move {
                        let _ = dc_for_open2
                            .send(&Bytes::from(encode_welcome(player_id.0)))
                            .await;
                    })
                }));
            }

            dc.on_message(Box::new(move |msg: DataChannelMessage| {
                let rtc_cmd_tx_for_msg2 = rtc_cmd_tx_for_msg.clone();
                Box::pin(async move {
                    if msg.is_string {
                        return;
                    }
                    if msg.data.len() > max_message_bytes {
                        return;
                    }
                    let Ok(client_msg) = decode_client_message(&msg.data) else {
                        return;
                    };
                    let _ = rtc_cmd_tx_for_msg2.try_send(RtcCmd::Client(client_msg));
                })
            }));

            if label == "game" {
                let mut maybe_rx = game_outbound_rx_for_msg.lock().await;
                if let Some(mut rx) = maybe_rx.take() {
                    let dc_for_send = Arc::clone(&dc);
                    tokio::spawn(async move {
                        while let Some(payload) = rx.recv().await {
                            if dc_for_send.send(&payload).await.is_err() {
                                break;
                            }
                        }
                    });
                }
            }
        })
    }));

    let offer = match RTCSessionDescription::offer(signal.sdp.unwrap_or_default()) {
        Ok(v) => v,
        Err(_) => return,
    };
    if peer_connection.set_remote_description(offer).await.is_err() {
        return;
    }
    let answer = match peer_connection.create_answer(None).await {
        Ok(v) => v,
        Err(_) => return,
    };
    if peer_connection.set_local_description(answer).await.is_err() {
        return;
    }

    let mut gather_complete = peer_connection.gathering_complete_promise().await;
    let _ = gather_complete.recv().await;

    let Some(local_desc) = peer_connection.local_description().await else {
        return;
    };

    let payload = serde_json::to_string(&RtcSignalOut {
        msg_type: "answer",
        sdp: Some(local_desc.sdp),
        message: None,
    })
    .unwrap_or_else(|_| "{\"type\":\"error\",\"message\":\"failed to build answer\"}".to_string());

    if ws_sender.send(Message::Text(payload)).await.is_err() {
        return;
    }

    drop(ws_sender);
    drop(ws_receiver);
    let _ = pc_closed_rx.recv().await;

    let _ = rtc_cmd_tx.try_send(RtcCmd::Shutdown);
    if let Err(err) = session_task.await {
        error!(
            player_id = player_id.0,
            "rtc session task join error: {err}"
        );
    }
    let _ = peer_connection.close().await;
}

async fn handle_client_msg(
    state: &Arc<AppState>,
    current_room: &mut Option<Arc<crate::room::RoomHandle>>,
    username: &mut String,
    player_id: PlayerId,
    msg: ClientMsg,
    outbound_tx: &mpsc::Sender<Bytes>,
    claimed_room_id: Option<&str>,
) -> bool {
    match msg {
        ClientMsg::Hello {
            username: requested_name,
        } => {
            if current_room.is_some() {
                info!(player_id = player_id.0, "ignoring hello after room join");
                return true;
            }
            if !requested_name.is_empty() {
                *username = requested_name;
            }
            true
        }
        ClientMsg::JoinRoom { room_id, map } => {
            let room_ref = if let Some(claimed) = claimed_room_id {
                if let Some(ref client_room) = room_id {
                    if client_room != claimed {
                        warn!(
                            player_id = player_id.0,
                            client_room_id = client_room,
                            ticket_room_id = claimed,
                            "JoinRoom: client room_id overridden by ticket"
                        );
                    }
                }
                claimed.to_string()
            } else {
                room_id.unwrap_or_else(|| DEFAULT_ROOM_ID.to_string())
            };
            let map_name = map.unwrap_or_else(|| DEFAULT_MAP_NAME.to_string());
            let Some(game_map) = load_map(&state.map_dir, &map_name) else {
                warn!(
                    player_id = player_id.0,
                    room_ref, "join rejected: room map unavailable"
                );
                return true;
            };
            let config = RoomConfig {
                name: room_ref.clone(),
                max_players: state.max_players_per_room,
                tick_rate: 60,
            };
            let Ok(target_room) = state
                .room_manager
                .get_or_create_room(config, game_map)
                .await
            else {
                warn!(
                    player_id = player_id.0,
                    room_ref, "join rejected: room create failed"
                );
                return true;
            };

            match state
                .room_manager
                .join_room(
                    player_id,
                    username.clone(),
                    Arc::clone(&target_room),
                    outbound_tx.clone(),
                )
                .await
            {
                Ok(success) => {
                    if outbound_tx.try_send(success.room_state).is_err() {
                        return false;
                    }
                    *current_room = Some(success.room);
                    true
                }
                Err(rejection) => {
                    let _ = outbound_tx.try_send(rejection);
                    true
                }
            }
        }
        ClientMsg::Input {
            seq,
            key_up,
            key_down,
            key_left,
            key_right,
            mouse_down,
            weapon_switch,
            weapon_scroll,
            aim_angle,
            facing_left,
        } => {
            let Some(room) = current_room.as_ref() else {
                return true;
            };
            let input = PlayerInput {
                key_up,
                key_down,
                key_left,
                key_right,
                mouse_down,
                weapon_switch: WeaponId::try_from(weapon_switch).ok(),
                weapon_scroll: weapon_scroll as i8,
                aim_angle,
                facing_left,
            };
            room.set_input(player_id, seq, input);
            true
        }
        ClientMsg::Ping { client_time_ms } => {
            let server_time_ms = state.started_at.elapsed().as_millis() as u64;
            let _ = outbound_tx.try_send(Bytes::from(encode_pong(client_time_ms, server_time_ms)));
            true
        }
    }
}


fn load_map(map_dir: &Path, map_name: &str) -> Option<GameMap> {
    match GameMap::load(map_dir, map_name) {
        Ok(map) => Some(map),
        Err(primary_err) => {
            error!("failed to load map '{map_name}': {primary_err}");
            None
        }
    }
}

fn load_turn_server() -> Option<RTCIceServer> {
    let turn_url = std::env::var("TURN_URL").ok()?;
    let username = std::env::var("TURN_USERNAME").unwrap_or_default();
    let credential = std::env::var("TURN_PASSWORD").unwrap_or_default();

    let mut server = RTCIceServer {
        urls: vec![turn_url],
        ..Default::default()
    };

    if !username.is_empty() || !credential.is_empty() {
        server.username = username;
        server.credential = credential;
        server.credential_type = RTCIceCredentialType::Password;
    }

    Some(server)
}

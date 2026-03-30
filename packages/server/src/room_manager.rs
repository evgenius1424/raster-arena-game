use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use bytes::Bytes;
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::binary::encode_join_rejected;
use crate::map::GameMap;
use crate::room::{PlayerId, RoomConfig, RoomHandle, RoomId};

pub const ROOM_MAX_PLAYERS_HARD_CAP: usize = 8;

#[derive(Default)]
pub struct RoomMetrics {
    pub rooms_created_total: AtomicU64,
    pub players_joined_total: AtomicU64,
    pub players_left_total: AtomicU64,
}

pub struct RoomManager {
    rooms: RwLock<HashMap<RoomId, Arc<RoomHandle>>>,
    names: RwLock<HashMap<String, RoomId>>,
    player_rooms: Mutex<HashMap<PlayerId, RoomId>>,
    pub metrics: RoomMetrics,
    server_started_at: Instant,
    max_rooms: usize,
    pub max_players_per_room: usize,
}

pub struct JoinSuccess {
    pub room: Arc<RoomHandle>,
    pub room_state: Bytes,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum RoomCreateError {
    InvalidMaxPlayers(String),
    Other(String),
}

impl fmt::Display for RoomCreateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidMaxPlayers(msg) => write!(f, "{msg}"),
            Self::Other(msg) => write!(f, "{msg}"),
        }
    }
}

impl RoomManager {
    pub fn new(server_started_at: Instant, max_rooms: usize, max_players_per_room: usize) -> Self {
        let effective_max_players = max_players_per_room.min(ROOM_MAX_PLAYERS_HARD_CAP);
        Self {
            rooms: RwLock::new(HashMap::new()),
            names: RwLock::new(HashMap::new()),
            player_rooms: Mutex::new(HashMap::new()),
            metrics: RoomMetrics::default(),
            server_started_at,
            max_rooms,
            max_players_per_room: effective_max_players,
        }
    }

    pub async fn get_or_create_room(
        &self,
        config: RoomConfig,
        map: GameMap,
    ) -> Result<Arc<RoomHandle>, RoomCreateError> {
        if config.max_players == 0 || config.max_players > self.max_players_per_room {
            return Err(RoomCreateError::InvalidMaxPlayers(format!(
                "maxPlayers must be 1..={}",
                self.max_players_per_room
            )));
        }

        let mut rooms = self.rooms.write().await;
        let mut names = self.names.write().await;

        if let Some(room_id) = names.get(&config.name) {
            if let Some(room) = rooms.get(room_id) {
                return Ok(Arc::clone(room));
            }
            names.remove(&config.name);
        }

        if rooms.len() >= self.max_rooms {
            return Err(RoomCreateError::Other("server room limit reached".to_string()));
        }

        let room_id = RoomId::from(Uuid::new_v4().simple().to_string());
        let room = RoomHandle::new(room_id.clone(), map, config.clone(), self.server_started_at);
        rooms.insert(room_id.clone(), Arc::clone(&room));
        names.insert(config.name, room_id);
        self.metrics
            .rooms_created_total
            .fetch_add(1, Ordering::Relaxed);
        Ok(room)
    }

    pub async fn join_room(
        &self,
        player_id: PlayerId,
        username: String,
        target_room: Arc<RoomHandle>,
        tx: mpsc::Sender<Bytes>,
    ) -> Result<JoinSuccess, Bytes> {
        self.leave_player(player_id).await;

        match target_room.join(player_id, username, tx).await {
            Ok(room_state) => {
                self.player_rooms
                    .lock()
                    .await
                    .insert(player_id, target_room.id().clone());
                self.metrics
                    .players_joined_total
                    .fetch_add(1, Ordering::Relaxed);
                Ok(JoinSuccess {
                    room: target_room,
                    room_state,
                })
            }
            Err(err) => Err(Bytes::from(encode_join_rejected(err.reason()))),
        }
    }

    pub async fn leave_player(&self, player_id: PlayerId) {
        if let Some(room_id) = self.player_rooms.lock().await.remove(&player_id) {
            if let Some(room) = self.rooms.read().await.get(&room_id).cloned() {
                room.leave(player_id);
                self.metrics
                    .players_left_total
                    .fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    #[cfg(test)]
    pub async fn current_players(&self) -> usize {
        self.player_rooms.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Instant;

    use bytes::Bytes;
    use tokio::sync::mpsc;

    use super::RoomManager;
    use crate::map::GameMap;
    use crate::room::{PlayerId, RoomConfig};

    fn map() -> GameMap {
        GameMap {
            rows: 1,
            cols: 1,
            bricks: vec![0],
            respawns: vec![(0, 0)],
            items: Vec::new(),
            name: "dm2".to_string(),
        }
    }

    fn config(name: &str, max: usize) -> RoomConfig {
        RoomConfig {
            name: name.to_string(),
            max_players: max,
            tick_rate: 60,
        }
    }

    #[tokio::test]
    async fn join_until_full() {
        let manager = RoomManager::new(Instant::now(), 50, 8);
        let room = manager
            .get_or_create_room(config("beta", 1), map())
            .await
            .expect("room create");
        let (tx1, _rx1) = mpsc::channel::<Bytes>(4);
        let (tx2, _rx2) = mpsc::channel::<Bytes>(4);

        let first = manager
            .join_room(PlayerId(1), "p1".to_string(), room.clone(), tx1)
            .await;
        assert!(first.is_ok());
        let second = manager
            .join_room(PlayerId(2), "p2".to_string(), room, tx2)
            .await;
        assert!(second.is_err());
    }

    #[tokio::test]
    async fn concurrent_join_respects_capacity() {
        let manager = Arc::new(RoomManager::new(Instant::now(), 50, 8));
        let room = manager
            .get_or_create_room(config("gamma", 2), map())
            .await
            .expect("room create");

        let mut tasks = Vec::new();
        for player in 0..6_u64 {
            let manager = Arc::clone(&manager);
            let room = Arc::clone(&room);
            tasks.push(tokio::spawn(async move {
                let (tx, _rx) = mpsc::channel::<Bytes>(2);
                manager
                    .join_room(PlayerId(player), format!("p{player}"), room, tx)
                    .await
                    .is_ok()
            }));
        }

        let mut joined = 0;
        for task in tasks {
            if task.await.unwrap_or(false) {
                joined += 1;
            }
        }
        assert_eq!(joined, 2);
    }

    #[tokio::test]
    async fn disconnect_cleanup_reuses_leave_path() {
        let manager = RoomManager::new(Instant::now(), 50, 8);
        let room = manager
            .get_or_create_room(config("epsilon", 2), map())
            .await
            .expect("room create");
        let (tx, _rx) = mpsc::channel::<Bytes>(4);
        let joined = manager
            .join_room(PlayerId(9), "p9".to_string(), room, tx)
            .await;
        assert!(joined.is_ok());

        manager.leave_player(PlayerId(9)).await;
        assert_eq!(manager.current_players().await, 0);
    }

    #[tokio::test]
    async fn moving_between_rooms_clears_old_membership() {
        let manager = RoomManager::new(Instant::now(), 50, 8);
        let room_a = manager
            .get_or_create_room(config("a", 8), map())
            .await
            .expect("room a");
        let room_b = manager
            .get_or_create_room(config("b", 8), map())
            .await
            .expect("room b");

        let (tx, _rx) = mpsc::channel::<Bytes>(8);

        let joined_a = manager
            .join_room(
                PlayerId(77),
                "p77".to_string(),
                Arc::clone(&room_a),
                tx.clone(),
            )
            .await;
        assert!(joined_a.is_ok());
        assert!(room_a.contains_player(PlayerId(77)).await);

        let joined_b = manager
            .join_room(PlayerId(77), "p77".to_string(), Arc::clone(&room_b), tx)
            .await;
        assert!(joined_b.is_ok());

        tokio::task::yield_now().await;
        assert!(!room_a.contains_player(PlayerId(77)).await);
        assert!(room_b.contains_player(PlayerId(77)).await);
    }
}

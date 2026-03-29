# Raster Arena

**Fast-paced 2D arena deathmatch in your browser.**

Pick up weapons, hunt other players, dominate the scoreboard. Matches are instant — no installs, no accounts.

---

## How to Play

- **Move** — `A` / `D` or arrow keys
- **Jump** — `W`, `Space`, or up arrow
- **Aim** — mouse
- **Shoot** — left click
- **Switch weapon** — scroll wheel or `1`–`9`
- **Console** — `~` (debug commands)

---

## Game Modes

| Mode | Description |
|---|---|
| Play with Bot | Solo deathmatch against an AI opponent — instant, no server needed |
| Multiplayer | Create or join a room and fight real players in real time |

---

## Weapons

Gauntlet · Machine Gun · Shotgun · Grenade Launcher · Rocket Launcher · Plasma Gun · BFG

Weapons and ammo spawn on the map and respawn on a timer. Control the power pickups to stay on top.

---

## Arena

Maps are tile-based grids with platforms, corridors, and open areas. Health packs, armor shards, and the Quad Damage buff are scattered across the arena — movement and map control matter as much as aim.

---

## Multiplayer Rooms

- Rooms are public and open — share the link to invite friends
- Up to 8 players per room
- The host starts the match from the lobby
- Sessions are in-memory; closing the tab leaves the room automatically

---

## Tech

Built with [PixiJS](https://pixijs.com) (rendering), [Rust](https://www.rust-lang.org) + [Axum](https://github.com/tokio-rs/axum) (game server), and [React](https://react.dev) (UI). Physics runs as shared Rust/WASM logic on both client and server.

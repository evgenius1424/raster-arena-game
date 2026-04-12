import { getWasmModuleSync } from '../wasm/client'

const m = getWasmModuleSync()

// ── Physics — sourced from WASM (Rust constants.rs is the single source of truth) ──

export const TILE_W: number = m.get_tile_w()
export const TILE_H: number = m.get_tile_h()
export const PHYSICS_TICK_MS: number = m.get_tick_millis()
export const SPAWN_OFFSET_X: number = m.get_spawn_offset_x()

export const PLAYER_HALF_W: number = m.get_player_hitbox_half_w()
export const PLAYER_HALF_H: number = m.get_player_half_h()
export const PLAYER_FULL_W: number = PLAYER_HALF_W * 2
export const PLAYER_FULL_H: number = PLAYER_HALF_H * 2

// Exact hitbox bounds relative to player.y (center) — use these for wireframe rects
export const HITBOX_TOP_STAND: number = m.get_player_hitbox_top_stand()
export const HITBOX_TOP_CROUCH: number = m.get_player_hitbox_top_crouch()
export const HITBOX_BOTTOM: number = m.get_player_hitbox_bottom()
export const HITBOX_HALF_W: number = m.get_player_hitbox_half_w()

// Crouch physics body — not yet exposed by WASM getters; keep in sync with Rust constants.rs
export const CROUCH_HALF_W = 8
export const CROUCH_HALF_H = 8
export const CROUCH_FULL_W: number = CROUCH_HALF_W * 2
export const CROUCH_FULL_H: number = CROUCH_HALF_H * 2

// Hit radii
export const HIT_RADIUS_ROCKET: number = m.get_hit_radius_rocket()
export const HIT_RADIUS_GRENADE: number = m.get_hit_radius_grenade()
export const HIT_RADIUS_PLASMA: number = m.get_hit_radius_plasma()
export const HIT_RADIUS_BFG: number = m.get_hit_radius_bfg()

// ── Renderer-only — visual constants with no physics equivalent ──────────────

// Background color
export const BG_COLOR = 0x0a0a14

// Sprite scaling (visual only)
export const PLAYER_SCALE_X = 0.667
export const PLAYER_SCALE_Y = 1.0
export const WEAPON_SCALE = 0.85
export const CROUCH_SCALE_FACTOR = 0.83
export const CROUCH_Y_OFFSET = 8
export const CROUCH_WEAPON_Y_OFFSET = 4

// Sprite frame sizes (px) — for future sprite atlas
export const SPRITE_FRAME_W = 48
export const SPRITE_FRAME_H_STANDING = 48
export const SPRITE_FRAME_H_CROUCH = 32

// Rendered display sizes (px)
export const RENDER_STANDING_W = 30
export const RENDER_STANDING_H = 48
export const RENDER_CROUCH_W = 33
export const RENDER_CROUCH_H = 33

// Projectile visual sizes (px)
export const ROCKET_W = 16
export const ROCKET_H = 8
export const GRENADE_SIZE = 12
export const PLASMA_SIZE = 12
export const BFG_SIZE = 24

// Explosion visual
export const EXPLOSION_RADIUS_LARGE = 40
export const EXPLOSION_RADIUS_SMALL = 15
export const EXPLOSION_LIFETIME_TICKS = 15

// Smoke emit intervals (ticks)
export const SMOKE_INTERVAL_ROCKET = 4
export const SMOKE_INTERVAL_GRENADE = 6

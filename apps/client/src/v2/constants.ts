// Tile
export const TILE_W = 32
export const TILE_H = 16

// Player physics body (half-extents)
export const PLAYER_HALF_W = 9
export const PLAYER_HALF_H = 24
export const PLAYER_FULL_W = 18
export const PLAYER_FULL_H = 48

// Crouch physics body (half-extents)
export const CROUCH_HALF_W = 8
export const CROUCH_HALF_H = 8
export const CROUCH_FULL_W = 16
export const CROUCH_FULL_H = 16

// Sprite scaling
export const PLAYER_SCALE_X = 0.667
export const PLAYER_SCALE_Y = 1.0
export const WEAPON_SCALE = 0.85
export const CROUCH_SCALE_FACTOR = 0.83
export const CROUCH_Y_OFFSET = 8
export const CROUCH_WEAPON_Y_OFFSET = 4

// Sprite frame sizes (px)
export const SPRITE_FRAME_W = 48
export const SPRITE_FRAME_H_STANDING = 48
export const SPRITE_FRAME_H_CROUCH = 32

// Rendered sizes (px)
export const RENDER_STANDING_W = 30
export const RENDER_STANDING_H = 48
export const RENDER_CROUCH_W = 33
export const RENDER_CROUCH_H = 33

// Projectile sizes (px)
export const ROCKET_W = 16
export const ROCKET_H = 8
export const GRENADE_SIZE = 12
export const PLASMA_SIZE = 12
export const BFG_SIZE = 24

// Projectile hit radii (px)
export const HIT_RADIUS_ROCKET = 28
export const HIT_RADIUS_GRENADE = 16
export const HIT_RADIUS_PLASMA = 20
export const HIT_RADIUS_BFG = 28

// Explosion visuals
export const EXPLOSION_RADIUS_LARGE = 40
export const EXPLOSION_RADIUS_SMALL = 15
export const EXPLOSION_LIFETIME_TICKS = 15

// Smoke emit intervals (ticks)
export const SMOKE_INTERVAL_ROCKET = 4
export const SMOKE_INTERVAL_GRENADE = 6

// Weapon ranges (px)
export const RANGE_GAUNTLET = 13
export const RANGE_SHAFT = 96
export const RANGE_SHOTGUN = 800
export const RANGE_MG = 1000
export const RANGE_RAIL = 2000

// Projectile speeds (px/tick)
export const SPEED_ROCKET = 7.0
export const SPEED_GRENADE = 5.25
export const SPEED_PLASMA = 8.0
export const SPEED_BFG = 8.0

// Fire rates (ticks between shots)
export const FIRERATE_SHAFT = 3
export const FIRERATE_MG = 5
export const FIRERATE_PLASMA = 5
export const FIRERATE_BFG = 10
export const FIRERATE_GAUNTLET = 20
export const FIRERATE_GL = 40
export const FIRERATE_RL = 40
export const FIRERATE_SG = 50
export const FIRERATE_RAIL = 75

// Renderer
export const BG_COLOR = 0x0a0a14
export const PHYSICS_TICK_MS = 16

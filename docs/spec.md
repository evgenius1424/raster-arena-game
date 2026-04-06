# VISUAL REBUILD SPEC — PixiJS from Scratch

## Raster Arena · Incremental Implementation Plan v2

**Renderer:** PixiJS v8 (WebGPU/WebGL2)
**Physics:** Untouched Rust/WASM (16ms tick, 62.5Hz)
**Interpolation:** `alpha = elapsed_since_tick / 16`, lerp between prev/current positions
**Art pipeline:** AI-generated sprites + hand-tuning for frame alignment

---

## ARCHITECTURE

```
stage
├── bgLayer            Container        z=0   parallax backgrounds
├── world              Container        z=1   camera-transformed
│   ├── bgDecorLayer   Container        z=10  background props
│   ├── tilesLayer     Container        z=20  auto-tiled map
│   ├── itemsLayer     Container        z=30  pickups with bob
│   ├── smokeLayer     Container        z=40  rocket/grenade trails
│   ├── projectilesLayer Container      z=50  rockets, plasma, etc
│   ├── entitiesLayer  Container        z=60  players + weapons
│   ├── fxLayer        Container        z=70  explosions, sparks
│   ├── beamLayer      Graphics         z=75  rail, shaft, aim lines
│   └── fgDecorLayer   Container        z=80  foreground deco
└── hudLayer           Container        z=100 screen-space UI
```

Render snapshot per entity (read-only contract from physics):

```
prevX, prevY, prevAimAngle
x, y, aimAngle
vx, vy
facingLeft, crouch, dead
currentWeapon, health, armor, ammo[]
spawnProtection, quadDamage          (ticks remaining)
```

---

## CONSTANTS REFERENCE

```
TILE_W = 32              TILE_H = 16
PLAYER_HALF_W = 9        PLAYER_HALF_H = 24       (physics body standing)
PLAYER_FULL_W = 18       PLAYER_FULL_H = 48
CROUCH_HALF_W = 8        CROUCH_HALF_H = 8
CROUCH_FULL_W = 16       CROUCH_FULL_H = 16

PLAYER_SCALE_X = 0.667   PLAYER_SCALE_Y = 1.0
WEAPON_SCALE = 0.85
CROUCH_SCALE_FACTOR = 0.83
CROUCH_Y_OFFSET = 8      CROUCH_WEAPON_Y_OFFSET = 4

Sprite frame: 48×48 (standing), 48×32 (crouch)
Rendered: 30×48 standing, 33×33 crouching

Projectile sizes: Rocket 16×8, Grenade 12×12, Plasma 12×12, BFG 24×24
Projectile hit radii: Rocket 28, Grenade 16, Plasma 20, BFG 28
Explosion visual: Large 40px / Small 15px, both 15-tick lifetime
Smoke: Rocket every 4 ticks, Grenade every 6 ticks

Weapon ranges: Gauntlet 13px, Shaft 96px, Shotgun 800px, MG 1000px, Rail 2000px
Projectile speeds (px/tick): Rocket 7.0, Grenade 5.25, Plasma 8.0, BFG 8.0
Fire rates (ticks): Shaft 3, MG 5, Plasma 5, BFG 10, Gauntlet 20, GL 40, RL 40, SG 50, Rail 75
```

---

## PHASE 1 — "HACKER MODE" FOUNDATION (Days 1–2)

No textures, no sprites. Pure geometry. Neon wireframe aesthetic. The goal is to rip out existing rendering and replace
it with a clean layered PixiJS structure where every game object is a colored primitive.

### M1.1 · PixiJS app + layer scaffold

Create the Application, the `world` container, and all named layer containers from the architecture diagram above. Wire
the `app.ticker` to your existing game loop. Clear stage to `0x0a0a14` (near-black with blue tint).

All subsequent milestones add children to these layers — nothing goes directly into `world` or `stage`.

### M1.2 · Map as neon rectangles

Loop through your map's 2D array. For each brick cell, draw a `Graphics` rectangle into `tilesLayer`:

```
Brick 0 (neutral): fill 0x00ff88, lineStyle 1px 0x00ff88 at 40% alpha
Brick 1 (red team): fill 0xff4466
Brick 2 (blue team): fill 0x4488ff
Empty cell: nothing
```

Size each rect exactly `TILE_W × TILE_H` (32×16). Position at `col * 32, row * 16`.

For spawn points (`R`, `B` markers in map): draw a pulsing circle outline, radius 12, at tile center.

### M1.3 · Player as rectangle

For each player (local + bots), draw into `entitiesLayer`:

```
Standing:  rect centered at (x, y), size 18×48, stroke only, no fill
Crouching: rect centered at (x, y + 8), size 16×16
Dead:      horizontal line at (x, y), width 18, 1px, 30% alpha
```

Colors: local player = `0x00ffcc`, bots cycle through `[0xff4466, 0x4488ff, 0xffaa00, 0xff66ff]`.

Draw an aim line: 1px line from player center in `aimAngle` direction, 50px long, same color at 30% alpha.

Position is interpolated: `renderX = prevX + (x - prevX) * alpha`.

### M1.4 · Camera

Two modes, matching existing logic:

**Fit mode** (small maps): `mapW <= canvasW && mapH <= canvasH`. Scale `world` to fit viewport, center it.
`scale = min(canvasW / mapPixelW, canvasH / mapPixelH, 1.6)`. The 1.6 cap prevents over-zoom.

**Float mode** (large maps): `world.x = canvasW/2 - playerRenderX`, `world.y = canvasH/2 - playerRenderY`. Clamp so
camera doesn't show past map edges.

No smoothing yet — direct tracking. Smoothing comes in Phase 3.

### M1.5 · Projectiles as shapes

Into `projectilesLayer`, for each active projectile:

```
Rocket:  16×8 rect, 0xff6600, rotated by atan2(vy, vx)
Grenade: 10×10 circle, 0x888888, rotated
Plasma:  8px circle, 0x00ffff
BFG:     16px circle, 0x00ff00
```

Interpolate positions same as players.

### M1.6 · Hitscan traces

Store active beams in an array: `{ x1, y1, x2, y2, color, width, age, maxAge }`. Draw into `beamLayer` (a single
`Graphics` that gets cleared and redrawn each frame).

```
Rail:     3px line, 0xff0000, maxAge 11 ticks, alpha fades with age
Shaft:    2px line, 0x45c8ff, maxAge 6 ticks
MG:       1px line, 0xffd24a, maxAge 3 ticks
Shotgun:  11× 1px lines fanning within 0.15 rad spread, 0xffd24a, maxAge 3 ticks
Gauntlet: 8 short lines radiating from contact point, 0x6ff2ff, maxAge 6 ticks
```

All beams: `alpha = 1 - (age / maxAge)`.

### M1.7 · Explosions + impacts

Into `fxLayer`. On projectile hit, push an effect:

```
Explosion (rocket/grenade/bfg):
  circle, starting radius 5, expanding to 40px over 15 ticks
  alpha = 1 - progress
  color: rocket/grenade 0xff6600, plasma 0x00ffff, bfg 0x00ff00

Bullet impact (MG/shotgun):
  small circle, radius 3, 0xffd24a, 12 ticks, fading

Rail impact:
  circle radius 5, 0xff0000, 8 ticks
```

### M1.8 · Minimal HUD

Into `hudLayer` (screen-space, not affected by camera):

```
Bottom-left:
  Health:  "HP: 100" as PIXI.Text, white, fontSize 14, monospace
  Armor:   "AR: 0"   below health
Bottom-right:
  Weapon:  "ROCKET [15]" — weapon name + ammo
Top-right:
  Kill feed: last 3 kills as text lines, fade after 4 seconds
Center:
  Crosshair: two 6px lines forming +, white, 70% alpha
  Position: 83px from player center in aim direction
```

Use `PIXI.BitmapText` if you want better perf, or `PIXI.Text` with `resolution: 2` for crispness.

### Checkpoint

You have a neon wireframe game. All physics works. Bots fight. Explosions flash. Beams draw. HUD shows stats. It looks
like TRON meets a prototype — and it's fully playable. Everything from here is purely visual improvement with zero
gameplay risk.

---

## PHASE 2 — ENVIRONMENT & AUTO-TILING (Days 3–5)

### M2.1 · Auto-tile lookup function

4-bit neighbor mask → 16 variants. Write a function that checks each cell's four neighbors:

```
bit 0 = solid above      (1)
bit 1 = solid right       (2)
bit 2 = solid below       (4)
bit 3 = solid left         (8)

mask = (up ? 1 : 0) | (right ? 2 : 0) | (down ? 4 : 0) | (left ? 8 : 0)
```

This gives you a 0–15 index. Map these to variant names:

```
 0 = lone           (no neighbors)
 1 = cap_bottom     (only up)
 2 = cap_left       (only right)
 3 = corner_BL      (up + right)
 4 = cap_top        (only down)
 5 = vert_bar       (up + down)
 6 = corner_TL      (right + down)
 7 = tee_left       (up + right + down)
 8 = cap_right      (only left)
 9 = corner_BR      (up + left)
10 = horiz_bar      (right + left)
11 = tee_bottom     (up + right + left)
12 = corner_TR      (down + left)
13 = tee_right      (up + down + left)
14 = tee_top        (right + down + left)
15 = center         (all four)
```

Build the full `variantMap[rows][cols]` once on map load. Rebuild only if map changes.

### M2.2 · Procedural tile atlas (no AI art yet)

Before bringing in AI-generated tile art, draw all 16 variants procedurally using `Graphics` → `RenderTexture`. This
ensures your auto-tiling logic works before you depend on external assets.

Each variant is 32×16. For each, draw:

```
Base fill: 0x3a3a4a (dark gray-blue)
Top edge exposed (no solid above):    2px bright strip 0x6a6a7a at top
Bottom edge exposed (no solid below): 2px dark strip 0x1a1a2a at bottom
Left edge exposed:                    1px bright strip at left
Right edge exposed:                   1px dark strip at right
Interior (all neighbors solid):       subtle 1px grid lines at x=16 and y=8, 10% alpha
```

Render all 16 into a single `RenderTexture` atlas (512×16). Store the atlas and UV offsets.

### M2.3 · Replace Graphics bricks with atlas Sprites

Swap out the M1.2 `Graphics` rectangles for `PIXI.Sprite` instances in `tilesLayer`.

For each brick cell:

- Look up `variantMap[row][col]` → variant index 0–15.
- Create a `Sprite` from the atlas frame at `(index * 32, 0, 32, 16)`.
- Position at `col * 32, row * 16`.
- Tint by team: neutral = `0xffffff` (no tint), red = `0xff8888`, blue = `0x8888ff`.

Cache all tile sprites — only recreate on map change. This is a static layer.

### M2.4 · AI-generated tile atlas

Now replace the procedural textures with real art. Generate a 512×16 PNG sprite sheet (16 variants, each 32×16, arranged
horizontally).

**Image AI prompt:**

```
Pixel art tileset sprite sheet, 16 tiles arranged in a single horizontal row,
each tile exactly 32 pixels wide and 16 pixels tall,
total image size 512×16 pixels,
sci-fi metal panel style, dark blue-gray base color,
each tile is a different edge/corner variant:
tile 1: isolated single block,
tile 2-5: end caps (one exposed edge each),
tile 6-9: corner pieces (two adjacent exposed edges),
tile 10-11: bars (horizontal and vertical corridors),
tile 12-15: T-junctions (three solid neighbors),
tile 16: fully interior (all neighbors solid, subtle rivet pattern),
exposed top edges have a bright cyan highlight strip (2px),
exposed bottom edges have dark shadow,
consistent lighting from top-left,
seamless connections between adjacent tiles,
transparent background, pixel art, clean edges, no anti-aliasing
```

**Hand-tuning needed:**

- Edges of adjacent variants must align pixel-perfectly.
- Top-exposed variants need a clearly visible lip (this is the platform surface players run on).
- Interior variant should have subtle texture but not compete with gameplay objects.
- Budget: 1–2 hours of pixel adjustment.

Load the AI-generated atlas and swap it in. Keep the procedural atlas as fallback.

### M2.5 · Item rendering in tilesLayer

For each item on the map (health, armor, weapons, quad):

```
Currently picked up → skip (invisible)
Otherwise → draw at tile center:
  x = col * TILE_W + TILE_W / 2
  y = row * TILE_H + TILE_H / 2
```

For now, use simple `Graphics` shapes in `itemsLayer`:

```
Health +5:    small green cross (6×6), 0x44ff44
Health +25:   medium green cross (10×10), 0x44ff44
Health +50:   large green cross (14×14), 0x44ff44
Health +100:  large green cross with glow circle behind it, 0x44ff88
Armor +50:    yellow diamond (8×8), 0xffcc00
Armor +100:   large yellow diamond (12×12), 0xffcc00
Quad:         purple square (10×10) with pulsing outline, 0xaa44ff
Weapons:      small colored rectangle matching weapon color
```

Add idle bob: `sprite.y = baseY + Math.sin(tick * 0.1) * 2`.

### Checkpoint

The map transforms from a grid of rectangles into a cohesive, carved-out arena. Tile edges connect properly. Items float
on platforms. It suddenly looks like level design instead of a debug view.

---

## PHASE 3 — DEPTH & IMMERSION (Days 6–8)

### M3.1 · Camera smoothing

Replace direct camera tracking with exponential smoothing:

```
cameraState = { x: playerX, y: playerY, trauma: 0 }

each frame:
  targetX = playerRenderX
  targetY = playerRenderY
  cameraState.x += (targetX - cameraState.x) * 0.12
  cameraState.y += (targetY - cameraState.y) * 0.10
  world.x = canvasHalfW - cameraState.x
  world.y = canvasHalfH - cameraState.y
```

Add facing lookahead: offset target 24px in the direction the player faces. This gives the player more visible space
ahead of them.

Clamp to map edges so the camera never shows the void beyond the map boundary.

Only in float mode — fit mode stays locked (small maps don't scroll).

### M3.2 · Camera shake (trauma system)

```
on explosion within 200px of player:
  trauma = min(1.0, trauma + 0.25)
on taking damage:
  trauma = min(1.0, trauma + 0.15)
on railgun fire (own):
  trauma = min(1.0, trauma + 0.1)

each tick:
  trauma *= 0.92  (exponential decay)

each frame:
  shakeMag = trauma * trauma  (quadratic for snappy feel)
  shakeX = shakeMag * Math.sin(tick * 8.9) * 6
  shakeY = shakeMag * Math.cos(tick * 7.1) * 4
  world.x += shakeX
  world.y += shakeY
```

Add a setting toggle to disable shake.

### M3.3 · Background gradient layer

Create `bgLayer` as the first child of `stage`, behind `world`.

Draw a vertical gradient: `0x08081a` (top) → `0x14142a` (bottom). Use a `Graphics` rect with fill gradient or a
pre-rendered `Sprite`.

This replaces the flat black void behind the map. Subtle but immediately adds mood.

### M3.4 · Procedural starfield

Add 150–200 tiny white dots to `bgLayer`, positioned randomly across the viewport.

```
each star: { x, y, size (0.5–2px), baseBrightness (0.3–0.9), twinklePhase }

each frame:
  alpha = baseBrightness + 0.15 * Math.sin(tick * 0.03 * speed + phase)
```

Parallax: stars shift at 0.08× camera velocity. Since they're far away, they barely move — but when you notice it, it
sells the depth.

Draw as `Graphics` circles or as tiny `Sprite` instances from a 2×2 white texture.

### M3.5 · AI background art — far layer

Generate a seamless tileable background texture (512×512 or 1024×512).

**Image AI prompt:**

```
Seamless tileable game background texture, 512×512 pixels,
dark sci-fi space station interior seen from far away,
deep blue-black color palette, average brightness below 25/255,
distant machinery, pipes, and structural supports as silhouettes,
subtle depth fog, atmospheric, moody,
must tile seamlessly in both X and Y directions,
no bright elements, no text, no UI elements,
painted or pixel art style
```

**Integration:**

- Create a `TilingSprite` in `bgLayer` (behind the starfield).
- Size it to viewport dimensions × 1.5 (buffer for parallax movement).
- Each frame: `tilingSprite.tilePosition.x = -cameraState.x * 0.15`.
- `tilingSprite.tilePosition.y = -cameraState.y * 0.10`.
- Alpha: 0.6 — must be subtle, never distract from gameplay.

**Hand-tuning:** Adjust brightness. If it's too visible, darken it. The background exists to prevent the void from
feeling empty, not to compete with tiles or players.

### M3.6 · AI background art — mid layer

Generate a second background layer with more defined shapes, slightly brighter.

**Image AI prompt:**

```
Seamless tileable parallax mid-layer for 2D game, 512×256 pixels,
sci-fi industrial silhouettes: columns, walkways, gantries, pipes,
dark blue-gray tones, slightly lighter than deep background,
semi-transparent, meant to be overlaid on darker background,
transparent or very dark background,
horizontal emphasis (wider than tall),
pixel art or painted style
```

**Integration:**

- Second `TilingSprite` in `bgLayer`, above the far layer.
- Parallax at 0.30× camera velocity (moves more, feels closer).
- Alpha: 0.3–0.4.

### M3.7 · Ambient particles

Add 30–50 floating particles that drift through the viewport, drawn in `bgDecorLayer` (inside `world`, so they move with
the camera but at full parallax speed — they feel "in the arena").

```
each particle:
  x, y: random within map bounds
  vx: random(-0.1, 0.1)
  vy: random(-0.2, -0.05)  (drifting upward)
  size: random(0.5, 1.5)
  alpha: random(0.1, 0.3)
  color: 0x88aacc (pale blue dust)

each frame:
  update position
  if offscreen: respawn at random position within map bounds
  draw as tiny circles
```

These are almost subliminal — you don't consciously notice them, but the world feels alive without them.

### Checkpoint

Moving through the map feels expansive. The camera glides, backgrounds shift at different depths, tiny particles drift
by. The arena has atmosphere. It feels like a place, not a data structure.

---

## PHASE 4 — THE PROTAGONIST (Days 9–12)

### M4.1 · Player sprite sheet — walk cycle

Generate a 12-frame walk cycle. Sheet layout: 12 frames at 48×48, single row (576×48 PNG).

**Image AI prompt:**

```
Pixel art character walk cycle sprite sheet,
12 frames arranged in a single horizontal row,
each frame 48×48 pixels, total image 576×48 pixels,
side-view sci-fi armored soldier facing right,
dark-toned armor with colored accent lights,
helmet with visor, compact proportions,
right hand positioned at center-right (weapon hand),
feet touching bottom of frame, head near top,
smooth walk cycle animation,
transparent background, clean pixel edges,
limited palette (16-24 colors),
consistent top-left lighting
```

Generate for one skin first (e.g., blue accent). Other skins later.

**Hand-tuning priorities:**

1. Feet must consistently land at `y = 48` (bottom of frame) — this aligns with `PLAYER_HALF_H = 24` below center.
2. The torso center-of-mass should be at approximately `y = 24` (frame center) — this is the physics center and weapon
   pivot.
3. Frame-to-frame motion must be smooth — no limbs teleporting between frames.
4. Character width should fill ~30px of the 48px frame (matching `PLAYER_SCALE_X = 0.667` scaling).
5. Budget: 2–3 hours of pixel-by-pixel frame correction.

### M4.2 · Sprite integration

Load the sheet, create an `AnimatedSprite` (or manually index a `Sprite` with frame rectangles).

```
const sheet = BaseTexture.from('sarge_walk.png')
const walkFrames = Array.from({ length: 12 }, (_, i) =>
  new Texture(sheet, new Rectangle(i * 48, 0, 48, 48))
)

const playerSprite = new Sprite(walkFrames[0])
playerSprite.anchor.set(0.5, 0.5)
playerSprite.scale.set(PLAYER_SCALE_X, PLAYER_SCALE_Y)  // 0.667, 1.0
entitiesLayer.addChild(playerSprite)
```

Position: `playerSprite.position.set(renderX, renderY)` where render position is interpolated.

Facing: `playerSprite.scale.x = facingLeft ? -PLAYER_SCALE_X : PLAYER_SCALE_X`.

Frame selection: `frameIndex = Math.floor(animTick / 2) % 12` — advance every 2 physics ticks (32ms per frame, full
cycle = 384ms).

### M4.3 · Idle animation

Generate 8-frame idle sheet (384×48).

**Image AI prompt:** Same character as walk, but standing still with subtle breathing motion — slight torso rise/fall,
arms at rest. 8 frames, 48×48 each.

State trigger: `vx == 0 && grounded && !crouch && !dead`.

Frame rate: every 4 ticks (64ms per frame, full cycle = 512ms). Slower than walk — idle should feel calm.

### M4.4 · Jump + fall animations

**Jump** — 6 frames (288×48):

- Frame 1–2: legs compress (crouch-launch).
- Frame 3–4: body extends upward, legs trail.
- Frame 5–6: arms up, fully airborne pose.
- Hold last frame while `vy < 0` (still ascending).

**Fall** — 4 frames (192×48):

- Frame 1: transition from jump apex.
- Frame 2–3: arms out, legs angling down.
- Frame 4: brace-for-landing pose.
- Hold last frame while `vy > 0` (still descending).

State triggers:

```
jump: !grounded && vy < -0.3
fall: !grounded && vy > 0.5
```

Transition: jump → fall happens naturally as `vy` crosses zero. No special handling needed.

### M4.5 · Crouch + die animations

**Crouch** — 8 frames (384×32, note: shorter frame height):

- Ducked pose, can double as crouch-idle and crouch-walk.
- Apply `CROUCH_SCALE_FACTOR = 0.83` to `scale.y`.
- Offset position by `CROUCH_Y_OFFSET = 8px` downward.

**Die** — 12 frames (576×48):

- Character collapses. Hold final frame, then fade `alpha` to 0 over 10 ticks.
- State: `player.dead == true`. Highest priority — overrides all other states.

### M4.6 · Animation state machine

```
function getAnimState(player) {
  if (player.dead) return 'die'
  if (player.crouch) {
    return Math.abs(player.vx) > 0.1 ? 'crouch_walk' : 'crouch_idle'
  }
  if (!player.grounded) {
    return player.vy < -0.3 ? 'jump' : 'fall'
  }
  return Math.abs(player.vx) > 0.1 ? 'run' : 'idle'
}
```

On state change: reset `animTick` to 0 so the new animation starts from frame 0.

Exception: `die` does not reset if already playing die (don't restart death animation).

Fallback: if a sprite sheet for a state isn't loaded, fall back to `run` frames. Always have `run` as the baseline.

### M4.7 · Weapon sprite attachment

Load 9 weapon PNGs. Each is a `Sprite` child of the player container, anchored at `(0, 0.5)` (pivot on the grip, barrel
extends right).

```
weaponSprite.anchor.set(0, 0.5)
weaponSprite.position.set(0, 0)  // at player center
weaponSprite.rotation = aimAngle  // interpolated
weaponSprite.scale.set(WEAPON_SCALE, facingLeft ? -WEAPON_SCALE : WEAPON_SCALE)
```

When crouching: `weaponSprite.y = CROUCH_WEAPON_Y_OFFSET` (4px down).

Only one weapon sprite visible at a time — swap texture on weapon switch.

Aim angle interpolation: `lerpAngle(prevAim, aim, alpha)` — handle the ±π wraparound.

### M4.8 · Bot rendering

Bots use the exact same sprite system as the local player. Iterate all players (local + bots), run the same animation
state machine, same interpolation, same weapon attachment.

Differentiate by tint or skin: `sprite.tint = botColors[playerIndex]` or load different skin sheets.

### Checkpoint

Animated characters run, jump, fall, crouch, and die. Weapons track the aim angle. Every entity in the game has visual
identity. The core look of the game is locked in.

---

## PHASE 5 — MODERN "JUICE" & FX (Days 13–18)

### M5.1 · Particle system setup

Use `@pixi/particle-emitter` (v5+) or roll your own lightweight array-based system. A custom system is simpler for this
game since all particles are basic:

```
particles = []

function spawn(config) {
  particles.push({
    x, y, vx, vy,
    size, sizeEnd,
    alpha, alphaEnd,
    color,
    age: 0,
    maxAge,
    gravity: config.gravity || 0
  })
}

function updateAndDraw(container) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.age++
    if (p.age >= p.maxAge) { particles.splice(i, 1); continue }
    const t = p.age / p.maxAge
    p.x += p.vx
    p.y += p.vy
    p.vy += p.gravity
    // draw circle at (p.x, p.y) with lerped size and alpha
  }
}
```

For performance: pool particle objects (reuse dead particles instead of splicing and allocating).

Draw into `smokeLayer` for trails, `fxLayer` for impacts and explosions.

### M5.2 · Rocket smoke trail

Every 4 ticks while a rocket is alive, spawn a smoke particle:

```
offset behind rocket: 10–14px opposite to velocity direction
  spawnX = rocket.x - Math.cos(angle) * (10 + Math.random() * 4)
  spawnY = rocket.y - Math.sin(angle) * (10 + Math.random() * 4)

vx: random(-0.2, 0.2)
vy: random(-0.15, -0.4)  (rises)
size: random(3, 6)
sizeEnd: size * 2.4       (grows)
alpha: 0.5
alphaEnd: 0
color: 0xcccccc (light gray)
maxAge: 32 + random(10)   (512–672ms)
gravity: 0
```

Draw as filled circles in `smokeLayer` with the interpolated size and alpha.

### M5.3 · Grenade smoke trail

Same system, every 6 ticks:

```
Darker: 0x999999
Smaller: size 2–4, sizeEnd: size * 2.0
Less drift: vy random(-0.05, -0.2)
Shorter life: 28 + random(10) ticks
```

### M5.4 · Multi-stage explosions

Replace single expanding circle (M1.7) with a multi-layer effect.

**Large explosion (rocket, grenade, BFG):**

Layer 1 — Core flash (into `fxLayer`):

```
White circle, blendMode: 'add'
scale: 0 → radius * 0.06 over 5 ticks
alpha: 1 → 0
```

Layer 2 — Fireball:

```
Filled circle, weapon color (orange/green)
scale: 0 → radius * 0.1 over 15 ticks
alpha: 0.9 → 0
```

Layer 3 — Shockwave ring:

```
Circle outline (lineStyle, no fill), weapon color, 2px width
scale: 0 → radius * 0.15 over 10 ticks
alpha: 0.7 → 0
```

Layer 4 — Debris:

```
8–12 small particle spawns radiating outward:
  speed: 1.5–3.5 px/tick, random angles
  size: 1.5–3
  alpha: 0.8 → 0
  gravity: 0.08 (fall after initial burst)
  maxAge: 18–25 ticks
  color: weapon color, slightly randomized brightness
```

Layer 5 — Smoke aftermath:

```
3–4 smoke puffs at detonation point:
  size: 4–8, growing to 2×
  alpha: 0.3 → 0
  vy: -0.3 (drift up)
  maxAge: 30–40 ticks
  color: 0x888888
```

**Small explosion (plasma):**
Same structure but smaller — radius 15, fewer debris (4–6), no smoke aftermath.

### M5.5 · Muzzle flash

On weapon fire, spawn a short-lived additive-blended flash at muzzle tip.

Muzzle position:

```
muzzleX = playerX + Math.cos(aimAngle) * PROJECTILE_OFFSET[weaponId]
muzzleY = playerY + Math.sin(aimAngle) * PROJECTILE_OFFSET[weaponId]

Offsets: Grenade 17, Rocket 18, Plasma 12, BFG 12
Hitscan: MG ~24, Shotgun ~28, Rail ~36, Shaft ~20, Gauntlet ~13
```

Effect per weapon:

```
MG:       small yellow circle, radius 4, blendMode 'add', 2 ticks
Shotgun:  large orange cone-ish flash, radius 8, 3 ticks
Rocket:   orange puff behind launcher, radius 6, 2 ticks
Plasma:   cyan puff, radius 5, 2 ticks
Rail:     bright red flash, radius 6, 3 ticks
BFG:      green flash, radius 10, 3 ticks
Gauntlet: cyan spark at fist tip, radius 3, 2 ticks
Shaft:    blue spark, radius 4, continuous while firing
```

### M5.6 · Bloom filter

Apply `@pixi/filter-bloom` (or a simple blur+additive pass) to specific layers:

```
projectilesLayer.filters = [new BloomFilter({ strength: 2, quality: 4 })]
fxLayer.filters = [new BloomFilter({ strength: 3, quality: 4 })]
beamLayer.filters = [new BloomFilter({ strength: 2.5, quality: 4 })]
```

This makes all projectiles, beams, and explosions physically glow on screen. Plasma balls become neon orbs. Rail shots
become searing beams. Explosions become blinding flashes.

**Performance note:** bloom is expensive. Only apply to the layers that benefit (not tiles or entities). If FPS drops,
reduce `quality` to 2 or disable on low-end devices.

Alternative if `@pixi/filter-bloom` isn't available: draw glow manually with additive-blended larger copies of each
light source at 30% alpha.

### M5.7 · Enhanced beam rendering

Upgrade the simple lines from M1.6 into multi-layer beams:

**Railgun beam** (3 layers):

```
Outer glow:  lineWidth = 8, color = railColor, alpha = 0.35, blendMode 'add'
Core:        lineWidth = 3, color = white (0xffffff), alpha = 1.0
Shimmer:     per-frame jitter — offset each segment midpoint by random ±2px perpendicular

All layers fade: alpha *= (1 - age/maxAge)
Terminal circle at hit point: radius 4, railColor, same fade
```

**Shaft beam** (3 layers):

```
Outer:  lineWidth = 8, 0x2b6cff, alpha 0.25, blendMode 'add'
Mid:    lineWidth = 4, 0x45c8ff, alpha 0.65, per-frame jitter ±2.5px
Inner:  lineWidth = 2, 0xe8fbff, alpha 1.0
Continuous while firing, disappears 6 ticks after trigger release
```

**MG tracer** (optional upgrade):

```
1px yellow line from muzzle to hit, 3-tick fade
Small yellow particle burst (3–4 sparks) at hit point
```

### M5.8 · Landing dust

Trigger: player state transitions from `jump`/`fall` to `idle`/`run` (grounded after airborne) and `vy > 1.5`.

```
spawnX = playerX
spawnY = playerY + PLAYER_HALF_H  (at feet, y + 24)

dustCount = Math.floor(Math.min(vy, 4) / 0.8)  // 2–5 particles

each dust particle:
  vx: random(-0.8, 0.8)
  vy: random(-0.3, -0.1)
  size: random(1.5, 3)
  alpha: 0.4
  alphaEnd: 0
  color: 0xaa9977 (tan/brown)
  maxAge: 12–18 ticks
```

### M5.9 · Damage + status effects

**Damage flash:**

- On taking damage: set `damageFlashTicks = 3`.
- During flash: `playerSprite.tint = 0xff4444` (red tint).
- After flash: restore `playerSprite.tint = 0xffffff`.

**Spawn protection** (when `spawnProtection > 0`):

- Draw a pulsing circle behind player in `fxLayer`.
- Radius: 26px, color: `0x88ffff`, alpha: `0.25 + 0.15 * Math.sin(tick * 0.3)`.
- Draw with `blendMode: 'add'` for glow effect.
- Fade out over last 20 ticks: `alpha *= spawnProtection / 20` when < 20.

**Quad damage** (when `quadDamage > 0`):

- `playerSprite.tint = 0xcc88ff` (purple tint).
- Purple glow ring behind player: radius 30, alpha 0.2, slow pulse.
- Every 4 ticks: spawn a tiny purple spark particle drifting upward from player.

### M5.10 · Projectile glow sprites

Upgrade from flat shapes (M1.5) to glowing sprites:

**Rocket:**

- Core: 16×8 sprite (or Graphics shape), rotated by velocity.
- Glow: additive-blended circle behind it, radius 12, 0xff4400, alpha 0.4.

**Plasma:**

- Core: 8px circle, 0x00ffff.
- Glow: additive circle, radius 14, 0x00aaff, alpha 0.3.
- Pulsing: `glowAlpha = 0.3 + 0.1 * Math.sin(tick * 0.5)`.

**BFG:**

- Core: 16px circle, 0x00ff00.
- Glow: additive circle, radius 28, 0x00ff00, alpha 0.35.
- Pulsing scale: `1.0 + 0.15 * Math.sin(tick * 0.3)`.

**Grenade:**

- Core: 6px dark gray circle.
- After 60 ticks (of 100 fuse): add blinking red dot, toggles every 5 ticks.

### Checkpoint

Firing feels heavy. Explosions light up the screen. Smoke curls from rockets. Beams sear across the arena. Bloom makes
everything glow. The game has juice. This is the phase where it stops feeling like a student project and starts feeling
like a modern indie game.

---

## PHASE 6 — POLISHED ITEMS & MAP INTERACTIVITY (Days 19–24)

### M6.1 · AI-generated item sprites

Replace the M2.5 placeholder shapes with actual sprites. Generate 7 item sprites at 32×32 PNG each.

**Image AI prompts (one per item):**

```
Pixel art game pickup icon, 32×32 pixels, transparent background,
[ITEM_DESCRIPTION], glowing, floating feel,
clean pixel edges, top-left lighting, limited palette

Items:
- Small health pack: tiny green cross with soft glow
- Medium health pack: green cross, brighter, larger
- Large health pack: large ornate green cross, strong glow
- Mega health: golden-green orb with radiant glow halo
- Armor shard: angular yellow crystal fragment
- Full armor: golden chest plate / shield icon
- Quad damage: purple glowing cube, ominous energy
```

**Integration:**

- Load sprites, create one `Sprite` per map item.
- Scale: `TILE_H * 1.2 / Math.max(tex.width, tex.height)` = `19.2 / 32 = 0.6`.
- Bob animation: `sprite.y = baseY + Math.sin(tick * 0.1) * 2`.
- When picked up: hide sprite (`visible = false`), respawn after respawn timer.

### M6.2 · Item pickup flash effect

When a player picks up an item:

```
At item position:
  1. White flash circle: radius 12, alpha 1→0, 8 ticks, blendMode 'add'
  2. Ring expansion: radius 5→25, alpha 0.6→0, 10 ticks
  3. Rising text: "+25 HP" or "+50 AR", white, drift upward (vy = -0.8), fade over 30 ticks

Mega health / Quad:
  Bigger flash (radius 20), more particles (8 colored sparks), screen shake (trauma += 0.08)
```

Store rising text as a `PIXI.Text` (or `BitmapText`) in `fxLayer`, update position and alpha each frame, remove when
alpha reaches 0.

### M6.3 · Weapon pickup sprites

Weapons on the ground should show the actual weapon sprite (from M4.7), scaled down:

```
weaponPickupSprite.texture = weaponTextures[weaponId]
weaponPickupSprite.scale.set(0.5)
weaponPickupSprite.anchor.set(0.5, 0.5)
```

Bob + slight rotation oscillation: `sprite.rotation = Math.sin(tick * 0.08) * 0.1`.

### M6.4 · Styled HUD — health + armor bars

Replace text-only HUD (M1.8) with visual bars:

```
Health bar (bottom-left, y offset from bottom):
  Background: 120×10 rect, 0x111111, rounded ends (2px radius)
  Fill: gradient left→right
    health > 50: 0x22dd44 → 0x44ff66
    health 25–50: 0xddaa22 → 0xffcc44
    health < 25: 0xdd2222 → 0xff4444
  Fill width: (health / maxHealth) * 116 (4px padding)
  Border: 1px 0x333344
  Number overlay: white text, right-aligned within bar

Armor bar (below health bar, 14px gap):
  Same structure, fill color: 0xddaa22 → 0xffcc44 (yellow-gold)
  maxArmor = 200
```

Low health effect: when `health < 25`, pulse the bar alpha `0.7 + 0.3 * Math.sin(tick * 0.4)` and add a subtle red
vignette overlay on screen edges.

### M6.5 · Weapon rack display

Bottom-center horizontal row showing all weapons:

```
For each weapon 0–8:
  If player has it: draw small weapon icon (16×8 scaled), full alpha
  If not owned: skip or draw at 15% alpha
  Current weapon: 1.3× scale, bright tint, thin glowing border
  Below each icon: ammo count as small text
```

### M6.6 · Kill feed with weapon icons

Right side, stacking from top:

```
Each kill entry:
  "[killer_name]  ⟨weapon_icon⟩  [victim_name]"
  Weapon icon: small 12×6 colored rectangle or actual weapon sprite, tinted
  Own kills: killer name highlighted yellow
  Own deaths: victim name highlighted red
  Slide in from right (animateX from +50 to 0 over 8 ticks)
  Fade out after 250 ticks (4 seconds)
  Max 5 visible, oldest removed first
```

### M6.7 · Respawn overlay

When the local player is dead:

```
Full-screen rect in hudLayer: 0x000000, alpha 0.35
Center text: "Respawning in X.X" — countdown based on remaining respawn ticks
  fontSize: 20, white, shadow
On respawn: alpha 0.35 → 0 over 15 ticks (quick fade-out)
```

### M6.8 · Timer + scoreboard

```
Top-center:
  Match timer: "MM:SS" format, 0xcccccc, fontSize 14
  Background: semi-transparent dark rect behind text

Top-left corner:
  Score list: top 4 players, "Name: Score" format
  Local player's line highlighted
  Compact layout, 12px font
```

### Checkpoint

The game has a complete, polished UI. Every interaction — picking up items, killing enemies, taking damage, respawning —
has visual feedback. The HUD is clean and informative. It looks and feels professional.

---

## PHASE 7 — THEMES & SKINS (Days 25–30)

### M7.1 · Theme system

Create a theme config structure:

```
const THEMES = {
  sci_fi: {
    tileAtlas: 'tiles_sci_fi.png',
    bgFar: 'bg_sci_fi_far.png',
    bgMid: 'bg_sci_fi_mid.png',
    bgGradientTop: 0x08081a,
    bgGradientBottom: 0x14142a,
    ambientParticleColor: 0x88aacc,
    ambientParticleType: 'dust',
  },
  ruins: { ... },
  lava: { ... },
  ice: { ... },
}
```

Map file specifies theme (or defaults to `sci_fi`). On map load:

1. Load theme-specific tile atlas.
2. Swap background `TilingSprite` textures.
3. Reconfigure ambient particle color/behavior.
4. Update gradient colors.

### M7.2 · Theme art generation

For each of the 4 themes, generate with AI:

**Tile atlas** (512×16, 16 variants):

```
Ruins:  crumbling stone blocks, mossy edges, warm grays and desaturated greens
Lava:   volcanic rock, glowing orange cracks between tiles, black base
Ice:    blue-tinted ice blocks, white frost edges, crystal highlights
Sci-fi: (already done in M2.4, polish here)
```

**Background far** (512×512, seamless):

```
Ruins:  ancient stone arches, foggy depth, dim torchlight
Lava:   lava cavern, orange glow from below, dark ceiling
Ice:    frozen cavern, blue-white, ice crystal formations
Sci-fi: (already done in M3.5, polish here)
```

**Background mid** (512×256, semi-transparent):

```
Ruins:  broken pillars and rubble silhouettes
Lava:   stalactites and lava drip silhouettes
Ice:    icicle and frozen formation silhouettes
Sci-fi: (already done in M3.6, polish here)
```

**Hand-tuning per theme:** Tile edge alignment, brightness levels, color balance. Budget: 2–3 hours per theme.

### M7.3 · Theme-specific ambient particles

```
sci_fi: pale blue dust motes, drifting slowly
ruins:  tan dust, occasional falling pebble (faster vy)
lava:   orange-red embers, drifting upward (vy negative, stronger)
ice:    white snowflakes, drifting downward (vy positive)
```

Adjust spawn rate, speed, size, and color per theme config.

### M7.4 · Player skins (6 variants)

Generate 6 color variants of each sprite sheet. Two approaches:

**Approach A — Palette swap (less AI work, more code):**

- Generate one base skin with AI.
- Write a palette-swap function: load sprite to offscreen canvas, `getImageData`, remap hue ranges, `putImageData`,
  create new `BaseTexture` from the canvas.
- Define 6 palettes: blue, red, white, dark, brown, "nuker" (orange/flame).

**Approach B — Full AI generation (more AI work, less code):**

- Generate all 6 skins separately with AI, specifying accent color in each prompt.
- More consistent quality but 6× the generation + hand-tuning work.

Recommendation: Approach A for speed, Approach B for quality. Start with A, replace individual skins with B later if
they look bad.

### Checkpoint

4 distinct visual themes and 6 player skins. Every map can feel different. Player customization adds identity.

---

## PHASE 8 — FINAL POLISH (Days 31–36)

### M8.1 · AI-generated projectile + weapon sprites

Replace any remaining placeholder shapes with actual sprites:

**Projectile sprites** (4 PNGs):

```
Rocket:  16×8, metallic body, orange nose cone
Grenade: 12×12, dark sphere, red indicator light
Plasma:  16×16, cyan energy ball, white core
BFG:     32×32, green energy sphere, intense glow
```

**Weapon sprites** (9 PNGs, if not already done in M4.7):
Finalize and polish all weapon art. Ensure barrel tips visually align with projectile spawn offsets.

### M8.2 · Run animation speed matching

Walk cycle frame rate should scale with player velocity:

```
const speedRatio = Math.abs(player.vx) / PLAYER_MAX_VELOCITY_X  // 0–1
const ticksPerFrame = Math.max(1, Math.floor(3 / (speedRatio + 0.01)))
frameIndex = Math.floor(animTick / ticksPerFrame) % walkFrames.length
```

At max speed: frame changes every tick (fast legs).
At slow speed: frame changes every 3 ticks (gentle walk).

### M8.3 · Grenade bounce spark

On grenade bounce (velocity direction changes):

```
At bounce point: spawn 3 white-yellow sparks
  speed: 1–2 px/tick, scatter angles near surface normal
  size: 1–2
  maxAge: 6–10 ticks
  color: 0xffffaa
```

Detect bounce by checking if grenade `vx` or `vy` sign flipped between ticks.

### M8.4 · Death effect enhancement

On player death:

```
1. Play die animation (12 frames)
2. At death frame 1: spawn 12–15 colored particles (player accent color)
   radiating outward, speed 1–3, gravity 0.06, maxAge 20–30 ticks
3. Brief red screen flash for the dying player: 
   full-screen rect, 0xff0000, alpha 0.12, fade over 4 ticks
4. After die animation ends: fade sprite alpha to 0 over 10 ticks
```

### M8.5 · Performance optimization

1. **Tile caching:** render all tiles to a single `RenderTexture` on map load. Draw that as one `Sprite` each frame
   instead of hundreds of individual tile sprites. Rebuild only on map change.

2. **Object pooling:** pre-allocate particle objects. On "death," return to pool instead of splicing array. On spawn,
   pull from pool.

3. **Frustum culling:** only draw entities/projectiles/particles within the viewport bounds (with 100px margin). Skip
   `sprite.visible = false` for offscreen objects.

4. **Batch rendering:** PixiJS batches sprites automatically. Avoid `Graphics` for per-frame draws where possible — use
   pre-rendered `RenderTexture` sprites instead.

5. **Profile target:** <3ms total render time at 60fps on mid-range hardware. Use Chrome DevTools Performance tab.

### M8.6 · Settings hookup

Wire visual settings to your existing Settings system:

```
railTrailColor:     user-selectable hex color, default 0xff0000
railTrailTime:      slider 5–20 ticks, default 11
screenShake:        on/off toggle
bloom:              on/off toggle (for low-end devices)
showFPS:            on/off toggle
particleDensity:    low/medium/high (scales particle counts by 0.3/0.7/1.0)
```

### Checkpoint

Production quality. Every visual element is polished, performant, and configurable.

---

## DAILY WORKFLOW

```
1. Pick next milestone from checklist
2. Ask Claude to generate the code (paste relevant constants + current module)
3. If sprites needed: generate with image AI, download, integrate
4. Test — does it render? Does it break anything?
5. Hand-tune: sprite alignment, colors, timing, alpha values
6. Commit: git commit -m "M3.4: jump + fall animations"
7. Screenshot before/after for your visual changelog
```

---

## AI PROMPT TEMPLATES

**Code generation (Claude):**

```
Milestone M[X.Y] of my PixiJS game renderer.
I need: [specific function/module]
Tech: PixiJS v8, no other frameworks. TypeScript or JS.
Constants: TILE_W=32, TILE_H=16, PLAYER_HALF_H=24, etc.
Style: no comments, public functions top, helpers bottom.
Current code structure: [paste the module being extended]
```

**Sprite sheets (image AI):**

```
Pixel art sprite sheet, [SUBJECT],
[COUNT] frames, each [W]×[H] pixels, single horizontal row,
total image [TOTAL_W]×[H] pixels,
transparent background, side view facing right,
[STYLE], consistent top-left lighting, clean pixel edges,
no anti-aliasing, limited palette (16-24 colors)
```

**Tile atlas (image AI):**

```
Pixel art tileset, 16 tiles in a single horizontal row,
each tile 32×16 pixels, total 512×16 pixels,
[THEME DESCRIPTION], seamless edge connections,
exposed top edges have bright highlight strip,
transparent background, clean pixel art
```

**Background textures (image AI):**

```
Seamless tileable game background, [SIZE]×[SIZE] pixels,
[THEME DESCRIPTION], very dark (avg brightness <25/255),
subtle detail, atmospheric depth,
must tile perfectly in X and Y
```

---

## MILESTONE CHECKLIST

```
PHASE 1 — HACKER MODE (Days 1–2)
[ ] M1.1  PixiJS app + layer scaffold
[ ] M1.2  Map as neon rectangles
[ ] M1.3  Player as rectangle
[ ] M1.4  Camera (fit + float modes)
[ ] M1.5  Projectiles as shapes
[ ] M1.6  Hitscan traces
[ ] M1.7  Explosions + impacts
[ ] M1.8  Minimal HUD

PHASE 2 — ENVIRONMENT & AUTO-TILING (Days 3–5)
[ ] M2.1  Auto-tile lookup function
[ ] M2.2  Procedural tile atlas (Graphics → RenderTexture)
[ ] M2.3  Replace Graphics with atlas Sprites
[ ] M2.4  AI-generated tile atlas
[ ] M2.5  Item rendering

PHASE 3 — DEPTH & IMMERSION (Days 6–8)
[ ] M3.1  Camera smoothing
[ ] M3.2  Camera shake (trauma system)
[ ] M3.3  Background gradient
[ ] M3.4  Procedural starfield
[ ] M3.5  AI background — far layer
[ ] M3.6  AI background — mid layer
[ ] M3.7  Ambient particles

PHASE 4 — THE PROTAGONIST (Days 9–12)
[ ] M4.1  Player walk cycle sprite sheet
[ ] M4.2  Sprite integration + facing
[ ] M4.3  Idle animation
[ ] M4.4  Jump + fall animations
[ ] M4.5  Crouch + die animations
[ ] M4.6  Animation state machine
[ ] M4.7  Weapon sprite attachment
[ ] M4.8  Bot rendering

PHASE 5 — MODERN JUICE & FX (Days 13–18)
[ ] M5.1  Particle system setup
[ ] M5.2  Rocket smoke trail
[ ] M5.3  Grenade smoke trail
[ ] M5.4  Multi-stage explosions
[ ] M5.5  Muzzle flash
[ ] M5.6  Bloom filter
[ ] M5.7  Enhanced beam rendering
[ ] M5.8  Landing dust
[ ] M5.9  Damage + status effects
[ ] M5.10 Projectile glow

PHASE 6 — POLISHED ITEMS & UI (Days 19–24)
[ ] M6.1  AI-generated item sprites
[ ] M6.2  Item pickup flash effect
[ ] M6.3  Weapon pickup sprites
[ ] M6.4  Styled HUD bars
[ ] M6.5  Weapon rack display
[ ] M6.6  Kill feed with weapon icons
[ ] M6.7  Respawn overlay
[ ] M6.8  Timer + scoreboard

PHASE 7 — THEMES & SKINS (Days 25–30)
[ ] M7.1  Theme system
[ ] M7.2  Theme art generation (4 themes)
[ ] M7.3  Theme-specific ambient particles
[ ] M7.4  Player skins (6 variants)

PHASE 8 — FINAL POLISH (Days 31–36)
[ ] M8.1  Projectile + weapon sprite art
[ ] M8.2  Run animation speed matching
[ ] M8.3  Grenade bounce spark
[ ] M8.4  Death effect enhancement
[ ] M8.5  Performance optimization
[ ] M8.6  Settings hookup
```

**Total: 50 milestones across 8 phases, ~36 sessions.**
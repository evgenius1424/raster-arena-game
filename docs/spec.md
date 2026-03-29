# VISUAL REBUILD SPEC — Canvas from Scratch
## Need-for-Fun · Incremental Implementation Plan

**Philosophy:** Each milestone = 1 session (1–3 hours), produces a visible improvement, and is independently shippable. You never go more than a session without seeing progress.

**Tech stack:** Raw Canvas 2D API → no PixiJS dependency for rendering. Physics layer (Rust/WASM) stays untouched.

**AI reliance:** Every milestone marks what to generate with AI (Claude, image gen) vs what to hand-tune.

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────┐
│  Existing (UNTOUCHED)                           │
│  ├── crates/physics_core/    Rust WASM physics  │
│  ├── game/physics.js         tick loop          │
│  ├── game/weapons.js         firing logic       │
│  ├── game/projectiles.js     projectile sim     │
│  ├── game/collision.js       collision          │
│  ├── game/map.js             map parsing        │
│  ├── game/player.js          player state       │
│  ├── net/                    networking         │
│  └── bot/                    bot AI             │
├─────────────────────────────────────────────────┤
│  NEW render layer (canvas/)                     │
│  ├── renderer.js             main loop + layers │
│  ├── camera.js               viewport + shake   │
│  ├── tiles.js                map drawing        │
│  ├── entities.js             players + weapons  │
│  ├── projectiles.js          projectile visuals │
│  ├── fx.js                   explosions, trails │
│  ├── hud.js                  health, ammo, feed │
│  ├── background.js           parallax + theme   │
│  └── assets.js               sprite loader      │
└─────────────────────────────────────────────────┘
```

The renderer reads a snapshot from the physics tick each frame. Zero coupling — physics writes state, renderer reads it.

```
Render snapshot per entity:
  prevX, prevY, prevAimAngle     (last tick position)
  x, y, aimAngle                 (current tick position)
  vx, vy                         (velocity — for animation state)
  facingLeft, crouch, dead
  currentWeapon, health, armor
  spawnProtection, quadDamage    (ticks remaining)
```

Interpolated position each frame: `lerp(prev, current, alpha)` where `alpha = elapsed_since_tick / 16`.

---

## CONSTANTS CHEAT SHEET

Keep this open while working. All values from existing physics.

```
TILE_W = 32, TILE_H = 16
PLAYER_HALF_W = 9,  PLAYER_HALF_H = 24   (physics body)
PLAYER_FULL_W = 18, PLAYER_FULL_H = 48
CROUCH_HALF_W = 8,  CROUCH_HALF_H = 8
CROUCH_FULL_W = 16, CROUCH_FULL_H = 16

HITBOX_HALF_W = 12
HITBOX_TOP = 24 (above center), HITBOX_BOTTOM = 22 (below center)

Projectile sizes: Rocket 16×8, Grenade 12×12, Plasma 12×12, BFG 24×24
Explosion radius: Large 40px, Small 15px
Smoke trail: Rocket every 4 ticks, Grenade every 6 ticks

Weapon ranges: Gauntlet 13px, Shaft 96px, Shotgun 800px, MG 1000px, Rail 2000px
```

---

## PHASE 0 — BARE CANVAS (Day 1)

### M0.1 · Canvas bootstrap

**What you see:** Black rectangle fills the screen.

- Create `<canvas>` element, size it to `window.innerWidth × window.innerHeight`.
- Get `ctx = canvas.getContext('2d')`.
- `requestAnimationFrame` loop that clears to `#111119`.
- Handle resize.
- Wire into your existing game init — replace PixiJS `app.view` with your canvas.

**AI:** Ask Claude to generate the bootstrap boilerplate.

### M0.2 · Draw the map as colored rectangles

**What you see:** Gray blocks appear forming the map layout.

- Read from your `Map` object (already parsed). For each cell that's a brick:
  ```
  ctx.fillStyle = '#555566'
  ctx.fillRect(col * 32, row * 16, 32, 16)
  ```
- Different fill for team tiles: `0` → gray, `1` → `#664444`, `2` → `#444466`.

**AI:** None needed — 5 lines of code.

### M0.3 · Draw the local player as a rectangle

**What you see:** A colored rectangle moves around the map, collides with platforms.

- Read player snapshot: interpolated `x, y`.
- Draw standing: `ctx.fillStyle = '#44cc44'; ctx.fillRect(x - 9, y - 24, 18, 48)`.
- Draw crouching: `ctx.fillRect(x - 8, y - 8, 16, 16)`.
- Different color for local player vs bots.

**AI:** None needed.

### M0.4 · Camera / viewport

**What you see:** The world scrolls to follow the player. Small maps fit on screen.

- Two modes (matching existing logic):
    - **Fit mode:** `mapPixelW <= canvasW && mapPixelH <= canvasH` → scale world to fit, center it.
    - **Float mode:** translate so player is centered: `ctx.translate(halfW - playerX, halfH - playerY)`.
- Clamp so camera doesn't show beyond map edges.
- Apply `ctx.save()` / `ctx.restore()` around world drawing.

**AI:** Ask Claude to generate camera module with fit/float modes.

### M0.5 · Draw all entities

**What you see:** Bot rectangles appear, move around, die, respawn.

- Iterate all players (local + bots). Draw each as a rectangle.
- Color by team or index: cycle through a palette.
- Dead players: draw as flat horizontal line (collapsed rectangle) or skip.
- Aim line: thin line from player center in `aimAngle` direction, 40px long, 30% alpha.

**AI:** None needed.

**Checkpoint:** You have a fully playable game with rectangles. Physics works, bots fight, you can shoot. It looks like a 1980s prototype — and that's the win.

---

## PHASE 1 — READABLE GAME (Days 2–4)

### M1.1 · Projectile rectangles

**What you see:** Rockets, grenades, plasma balls are visible as small colored rectangles flying through the map.

- Rocket: `16×8` orange `#ff6600` rect, rotated by `atan2(vy, vx)`.
- Grenade: `12×12` dark gray `#666666` rect, rotated.
- Plasma: `12×12` cyan `#00ffff` rect.
- BFG: `24×24` green `#00ff00` rect.
- Use `ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.fillRect(-hw,-hh,w,h); ctx.restore()`.

**AI:** None needed.

### M1.2 · Hitscan lines

**What you see:** Rail shots draw a line across the screen. Shaft draws a beam to the target.

- Rail: draw a line from muzzle to hit point, color `#ff0000`, lineWidth 3, fade alpha over 11 ticks.
- Shaft: 3-layer beam (wide transparent blue, medium blue, thin white), lineWidth 8/4/2, lifetime 6 ticks.
- Machinegun: brief 1px yellow line, 3 ticks.
- Shotgun: 11 short lines fanning out with 0.15 rad spread.
- Store active beams in an array: `{ x1, y1, x2, y2, color, width, age, maxAge }`.

**AI:** Ask Claude to generate the beam rendering + fade system.

### M1.3 · Explosion circles

**What you see:** Colored expanding circles at impact points.

- On projectile hit: push `{ x, y, radius: 40, color, age: 0, maxAge: 15 }`.
- Each frame: `progress = age / maxAge`, draw circle at `radius * (1 + progress)`, alpha = `1 - progress`.
- Rocket/Grenade: orange. Plasma: cyan, radius 15. BFG: green.

**AI:** None needed — 15 lines.

### M1.4 · Bullet impact dots

**What you see:** Small flashing dots at bullet hit points.

- MG hit: yellow dot, radius 3, 12-tick fade.
- Shotgun: 11 yellow dots at each pellet hit.
- Gauntlet: cyan spark burst — 8 short lines radiating from contact point, 6 ticks.
- Rail: red dot at termination, radius 5.

**AI:** None needed.

### M1.5 · Basic HUD

**What you see:** Health bar, armor bar, ammo count, weapon name — all drawn with Canvas text/rects.

- Bottom-left: health bar (green fill, red when < 25), number overlay.
- Bottom-left below health: armor bar (yellow fill), number overlay.
- Bottom-right: current weapon name + ammo count.
- Top-right: kill feed — last 5 kills, white text, fade after 5 seconds.
- Use `ctx.fillText()` with a monospace font.

**AI:** Ask Claude to generate the HUD layout with proper positioning.

### M1.6 · Crosshair

**What you see:** A small cross follows your aim point.

- Position: `(playerX + cos(aim) * 83, playerY + sin(aim) * 83)`.
- Draw: two 6px lines forming a cross, white, 70% alpha, 1px width.
- Alternative: small circle outline, radius 4.

**AI:** None needed — 6 lines.

**Checkpoint:** The game is now fully readable. You can see every game event — shots, hits, explosions, health. It looks like a clean vector game. Dopamine: "I built a complete game renderer in Canvas in a few days."

---

## PHASE 2 — SHAPE & SHADING (Days 5–8)

### M2.1 · Brick tiles with depth

**What you see:** Tiles look like 3D-ish blocks instead of flat rectangles.

- Top edge: 2px bright strip (`#999aaa`) — the "lit surface".
- Left edge: 1px slightly brighter.
- Bottom edge: 2px dark strip (`#333344`) — shadow.
- Right edge: 1px darker.
- Fill center with base color.
- Result: every platform looks like it has physical depth.

```
function drawBrick(ctx, x, y, w, h, baseColor) {
  ctx.fillStyle = baseColor
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x, y, w, 2)              // top highlight
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(x, y + h - 2, w, 2)      // bottom shadow
}
```

**AI:** None needed — pattern above.

### M2.2 · Auto-tiling (edge-aware bricks)

**What you see:** Platforms have visible top surfaces, walls have side faces, corners look correct.

- 4-bit neighbor lookup: `up|right|down|left` → 16 variants.
- For each variant, adjust which edges get highlights/shadows.
- Top-exposed tiles: thick bright top edge (3px), grass-like or metallic lip.
- Interior tiles (all neighbors solid): subtle mortar lines only.
- Lone tiles: all 4 edges highlighted.

**AI:** Ask Claude to generate the 16-variant drawing function. Each variant is just a few `fillRect` calls with different highlight/shadow placement.

### M2.3 · Player body shape

**What you see:** Players are humanoid silhouettes instead of rectangles.

- Draw with basic shapes — no sprites yet:
    - Head: circle, radius 5, at `y - 18`.
    - Torso: rounded rect, 14×16, centered at `y - 6`.
    - Legs: two small rects, at `y + 10` to `y + 24`.
- Facing: mirror by flipping x-offsets.
- Crouching: squash torso, tuck legs.
- Dead: rotate 90°, flatten.
- Color per player index.

**AI:** Ask Claude to generate the multi-shape player drawing function.

### M2.4 · Weapon shapes

**What you see:** A visible weapon extends from the player, pointing at the aim direction.

- Draw each weapon as 2–3 rectangles (body + barrel) rotated to `aimAngle`.
- Pivot at player center, offset by weapon-specific length.
- Different shapes per weapon:
    - Gauntlet: short wide block.
    - Rocket launcher: long thin tube.
    - Railgun: very long thin barrel.
    - BFG: thick wide barrel.
- `ctx.save(); ctx.translate(px, py); ctx.rotate(aim); drawWeaponShape(weaponId); ctx.restore()`.

**AI:** Ask Claude to generate the 9 weapon shape functions with correct proportions.

### M2.5 · Projectile shapes with glow

**What you see:** Projectiles look like glowing objects, not flat rectangles.

- Rocket: pointed nose shape (triangle + rect), orange, with a radial gradient glow behind it.
- Grenade: dark circle with a red blinking dot.
- Plasma: cyan circle with additive glow — draw a larger semi-transparent circle behind.
- BFG: large green circle with pulsing glow ring.
- Glow: `ctx.globalCompositeOperation = 'lighter'` + draw a soft radial gradient circle.

**AI:** Ask Claude to generate radial gradient glow helper + per-projectile draw functions.

### M2.6 · Smoke trails (particles)

**What you see:** Rockets and grenades leave smoke behind them.

- Particle system: array of `{ x, y, vx, vy, age, maxAge, size, alpha, color }`.
- Rocket: every 4 ticks, spawn a gray puff behind the rocket (opposite to velocity).
    - Size grows: `baseSize * (1 + progress * 1.4)`.
    - Alpha fades: `0.6 * (1 - progress)`.
    - Slight upward drift: `vy = -0.2`.
    - Lifetime: 32–42 ticks.
- Grenade: every 6 ticks, slightly darker, smaller puffs.
- Draw each puff as a filled circle with alpha.

**AI:** Ask Claude to generate the particle system module (spawn, update, draw).

### M2.7 · Multi-layer explosions

**What you see:** Explosions have a bright flash, expanding fireball, and fading ring.

Replace the single circle with 3 layers:
1. **Core flash:** white → weapon color, scale 0→1.5×, 5 ticks, `globalCompositeOperation = 'lighter'`.
2. **Fireball:** color circle, scale 0→3×, alpha 1→0, 15 ticks.
3. **Ring:** thin circle outline, scale 0→4×, alpha 0.8→0, 10 ticks.
4. **Debris:** 6–8 small dots flying outward with slight gravity, 20 ticks.

**AI:** Ask Claude to generate the multi-stage explosion renderer.

**Checkpoint:** Game looks like a polished vector/geometric shooter. Clean, readable, stylish. Everything has glow and depth. Dopamine: "This actually looks good as a deliberate art style."

---

## PHASE 3 — SPRITE ASSETS (Days 9–14)

Now we introduce actual pixel-art sprites. AI generates them, you fine-tune.

### M3.1 · Tile sprite atlas generation

**What you see:** Themed textured tiles replace the shaded rectangles.

**AI generation workflow:**
1. Prompt an image AI for a 512×32 tile atlas (16 variants × 32px wide × 16px tall, laid out horizontally). Describe: "pixel art tileset, sci-fi metal panels, 32×16 tiles, seamless edges, top-lit".
2. The AI output will need hand-correction — tiles must seamlessly connect at edges.
3. Generate 1 theme first (sci-fi or ruins). Others come in Phase 7.

**Integration:**
- Load the atlas image.
- `drawImage(atlas, srcX, 0, 32, 16, destX, destY, 32, 16)` per tile.
- `srcX = variantIndex * 32` from the auto-tiling lookup (M2.2).
- Fall back to the M2.1 shaded rectangles if atlas isn't loaded.

**Hand-tuning:** Fix tile edge alignment. Ensure top-edge variant has a visible bright lip. Budget: 1–2 hours of pixel tweaking.

### M3.2 · Player sprite sheet — walk cycle

**What you see:** The player rectangle is replaced with an animated walking character.

**AI generation workflow:**
1. Generate a 12-frame walk cycle sprite sheet. Each frame: 48×48px. Total: 576×48.
2. Prompt: "pixel art side-view sci-fi soldier walk cycle, 12 frames, 48×48 each, transparent background, facing right, armored, consistent style".
3. AI will produce something approximate — you fix limb positions frame by frame.

**Integration:**
- Load sheet, slice into frames.
- On each render: pick frame based on `walkFrameIndex`.
- `walkFrameIndex = floor(tickCounter / 2) % 12` (change frame every 2 ticks = 32ms).
- Flip horizontally for left-facing: `ctx.scale(-1, 1)`.
- Scale to match physics: draw at 30×48 on screen (matching `PLAYER_SCALE_X = 0.667`).

**Hand-tuning:** Smooth out janky frames. Ensure feet touch the ground at `y + 24`. Budget: 2–3 hours.

### M3.3 · Player sprite — idle

**What you see:** Player stands still with a subtle breathing animation instead of frozen walk frame.

- 8 frames, 48×48, subtle torso bob.
- AI generates, you clean up.
- State: `vx == 0 && grounded && !crouch`.

### M3.4 · Player sprite — jump + fall

**What you see:** Player visually leaps and falls with distinct poses.

- Jump: 6 frames (crouch-launch → extend → arms up). Hold last frame while ascending.
- Fall: 4 frames (arms out → legs down → brace). Hold last frame while descending.
- State detection: `vy < -0.3` → jump, `vy > 0.5` → fall.
- AI generates both sheets. Hand-tune the transition frame between jump and fall.

### M3.5 · Player sprite — crouch + die

**What you see:** Crouching player is visually squashed. Death has a collapse animation.

- Crouch: 8 frames, 48×32, can reuse for idle+walk while crouched.
- Die: 12 frames, 48×48, character falls/collapses. Hold last frame, then fade alpha.
- Crouch offset: draw at `y + CROUCH_Y_OFFSET` (8px lower).

### M3.6 · Weapon sprites

**What you see:** Actual weapon art replaces the geometric shapes.

**AI generation:** 9 weapon sprites, each a single PNG.
- Gauntlet: 32×16, mechanical fist.
- MG: 32×8, compact rifle.
- Shotgun: 40×10, wide barrel.
- Grenade launcher: 36×14.
- Rocket launcher: 42×14.
- Railgun: 48×8.
- Plasma gun: 28×10.
- Shaft: 36×10.
- BFG: 48×20.

All drawn horizontally, barrel pointing right, transparent background. Anchor at left-center (handle).

**Integration:**
- Rotate + draw at player center, offset by `aimAngle`.
- `scale.y` flipped when facing left (so weapon doesn't appear upside down).
- Scale: `0.85` of natural size.

**Hand-tuning:** Ensure barrel tips align with projectile spawn offsets. Budget: 1 hour.

### M3.7 · Projectile sprites

**What you see:** Rockets look like rockets, plasma looks like energy balls.

- Rocket: 16×8, gray body with orange tip.
- Grenade: 12×12, dark sphere with red dot.
- Plasma: 16×16, cyan radial glow with white core.
- BFG: 32×32, green radial glow.

Draw the sprite, then the glow circle behind it with `'lighter'` composite mode.

**AI generation:** 4 sprites. Minimal hand-tuning.

### M3.8 · Item/pickup sprites

**What you see:** Health packs, armor, weapons on the ground are distinct icons.

- 7 sprites at 32×32: health5, health25, health50, health100, armor50, armor100, quad.
- Draw at tile center, scaled to `19.2 / max(w, h)`.
- Add bob: `y += sin(tick * 0.1) * 2`.

**AI generation:** 7 sprites. Style must match player/weapon art.

**Checkpoint:** The game now has real art. Characters animate, weapons look correct, items are recognizable. Dopamine: "This looks like a real game."

---

## PHASE 4 — EFFECTS POLISH (Days 15–19)

### M4.1 · Muzzle flash

**What you see:** Bright flash at the weapon barrel tip when firing.

- Per weapon fire event: spawn a short-lived flash at muzzle position.
- MG: small yellow cone, 2 ticks.
- Shotgun: large orange cone, 3 ticks.
- Rocket: orange backblast behind launcher, 2 ticks.
- Plasma: cyan puff, 2 ticks.
- Draw with additive blending, radial gradient from white center to weapon color.

**AI:** Ask Claude to generate muzzle flash renderer with per-weapon configs.

### M4.2 · Screen shake

**What you see:** Camera jolts on explosions and taking damage.

- Trauma system: `trauma = min(1, trauma + intensity)`, decays `*= 0.92` per tick.
- Offset: `shakeX = trauma² * sin(tick * 8.9) * 8`, `shakeY = trauma² * cos(tick * 7.1) * 5`.
- Apply to camera translate before drawing world.
- Triggers: explosion near player (intensity 0.3), taking damage (intensity 0.2), railgun fire (intensity 0.15).

**AI:** Ask Claude to generate the trauma/shake module.

### M4.3 · Damage flash

**What you see:** Player flashes red briefly when hit.

- On damage event: set `damageFlashTicks = 4`.
- During flash: draw player sprite with `ctx.globalCompositeOperation = 'source-atop'` and red overlay, or tint by drawing a red rect over the sprite at 40% alpha.
- Simpler approach: alternate `ctx.filter = 'brightness(2) saturate(0)'` for 2 frames.

### M4.4 · Spawn protection glow

**What you see:** Freshly spawned players have a pulsing cyan shield.

- When `spawnProtection > 0`: draw a semi-transparent cyan circle behind the player.
- Radius: 28px, alpha: `0.3 + 0.2 * sin(tick * 0.3)`.
- Color: `rgba(136, 255, 255, alpha)`.
- Fade out over last 20 ticks of protection.

### M4.5 · Quad damage effect

**What you see:** Player with quad has a purple glow and tinted sprite.

- When `quadDamage > 0`:
    - Draw purple glow ring behind player (radius 30, alpha 0.2, slow pulse).
    - Tint player sprite purple: draw sprite, then overlay `rgba(170, 68, 255, 0.3)` with `'source-atop'`.
    - Every 4 ticks: spawn a tiny purple spark drifting upward.

### M4.6 · Landing dust

**What you see:** Small dust puffs when landing from a fall.

- Trigger: player transitions from airborne to grounded with `vy > 1.5`.
- Spawn 3–5 small tan particles at foot position (`y + 24`).
- Spread horizontally, slight upward drift, fade over 15 ticks.
- Intensity scales with `vy`: more particles + larger for harder landings.

### M4.7 · Grenade bounce spark

**What you see:** Tiny spark when a grenade bounces off a wall/floor.

- Trigger: grenade velocity changes direction (bounce detected).
- Spawn 3 small white-yellow sparks at bounce point, scatter outward, 8 ticks.

### M4.8 · Death effect

**What you see:** On death, small particle burst + screen flash.

- Play die animation.
- At death frame: spawn 10–15 colored particles (player color) radiating outward.
- Brief red screen flash for the player who died (2 frames, 10% alpha overlay).
- After die animation completes: fade sprite alpha to 0 over 10 ticks.

**Checkpoint:** The game has game-feel. Hits feel impactful, weapons feel powerful, movement feels responsive. Dopamine: "This FEELS like a real arena shooter."

---

## PHASE 5 — BACKGROUNDS & ATMOSPHERE (Days 20–23)

### M5.1 · Solid color gradient background

**What you see:** The black void behind the map becomes a moody gradient.

- Draw a vertical linear gradient before the world: dark blue-black at top → slightly lighter at bottom.
- `ctx.createLinearGradient(0, 0, 0, canvasH)` with stops: `#0a0a14` at 0, `#151525` at 1.

**AI:** None needed — 5 lines.

### M5.2 · Procedural starfield background

**What you see:** Tiny twinkling stars behind the map.

- Generate 200 random star positions (seeded by map name for consistency).
- Each star: `{ x, y, brightness, twinklePhase }`.
- Draw as 1–2px dots, alpha varies with `sin(tick * twinkleSpeed + phase)`.
- Parallax: stars move at 0.1× player velocity (barely shifts).

**AI:** Ask Claude to generate the starfield renderer with twinkle.

### M5.3 · Tiling background texture

**What you see:** A subtle texture fills the background instead of plain gradient.

**AI generation:** Generate a seamless 256×256 tileable texture. Prompt: "dark sci-fi wall texture, seamless, tileable, dark blue-gray, subtle panel lines, pixel art or painted, very dark".

**Integration:**
- Load as an image, create a pattern: `ctx.createPattern(img, 'repeat')`.
- Draw as a filled rect behind everything.
- Parallax: offset the pattern by `(-cameraX * 0.15, -cameraY * 0.15)` using `ctx.setTransform()`.

**Hand-tuning:** Adjust brightness. The background must never compete with gameplay elements. Very dark, very subtle.

### M5.4 · Parallax mid-layer

**What you see:** A second background layer moves at a different speed, creating depth.

**AI generation:** Generate a 512×256 semi-transparent midground layer. Prompt: "sci-fi corridor silhouettes, dark, parallax layer, transparent background, pillars and arches, very desaturated".

**Integration:**
- Draw between background and tiles.
- Parallax: move at 0.3× player velocity.
- Alpha: 0.3–0.5 (must not obscure gameplay).

### M5.5 · Ambient particles

**What you see:** Floating dust motes or sparks drift through the air.

- 30–50 ambient particles, always present.
- Tiny (1–2px), very low alpha (0.2–0.4), random slow drift.
- Respawn at random position when they leave the viewport.
- Theme-dependent: dust (ruins), sparks (sci-fi), embers (lava), snowflakes (ice).

**AI:** Ask Claude to generate ambient particle system with theme configs.

**Checkpoint:** The game has atmosphere. The world feels like a place, not a void. Dopamine: "This looks moody and immersive."

---

## PHASE 6 — HUD POLISH (Days 24–26)

### M6.1 · Styled health/armor bars

**What you see:** HUD bars have beveled edges, color transitions, and pulse effects.

- Health bar: gradient fill (green → yellow → red based on value), rounded ends, dark border.
- Armor bar: yellow-gold gradient, same style.
- Low health: bar pulses (alpha oscillation), red vignette on screen edges.
- Numbers rendered with shadow for readability.

**AI:** Ask Claude to generate the polished HUD drawing code.

### M6.2 · Weapon rack display

**What you see:** Bottom-center shows all owned weapons as small icons, current highlighted.

- Draw small weapon silhouettes (16×8) in a horizontal row.
- Current weapon: brighter, slightly larger, glowing border.
- Weapons not owned: dark gray / invisible.
- Ammo count below each weapon icon.

### M6.3 · Kill feed styling

**What you see:** Kill messages slide in from the right with weapon icons.

- Each kill: `[killer] [weapon_icon] [victim]` — right-aligned, slides in, fades after 4 seconds.
- Weapon icon: tiny colored symbol (circle for RL, line for rail, etc).
- Your own kills: highlighted in yellow. Your own deaths: highlighted in red.
- Stack up to 5 visible, oldest fade out.

### M6.4 · Timer and score

**What you see:** Match timer at top center, scores at top corners.

- Timer: `MM:SS` format, white, subtle background rect.
- Scores: `PlayerName: XX` for top 2–4 players.
- Your score highlighted.

### M6.5 · Respawn overlay

**What you see:** When dead, a dark overlay with "Respawning in X.X" text.

- Semi-transparent black overlay (40% alpha) during death.
- Countdown text in center.
- Fades out over 10 ticks on respawn.

**Checkpoint:** The game has a professional UI. Dopamine: "This looks like it could ship."

---

## PHASE 7 — THEMES (Days 27–31)

### M7.1 · Theme system architecture

- Create `themes.js`: `{ name, tileAtlas, bgImage, bgMidImage, particleType, particleColor, palette }`.
- Map header can specify theme (default: sci-fi).
- All rendering reads from current theme config.

### M7.2 · Ruins theme

**AI generation:**
- Tile atlas: stone blocks, mossy, crumbling edges. 512×32.
- Background: dark stone arches, foggy. 256×256 seamless.
- Midground: broken pillars silhouette. 512×256.
- Palette: warm grays, desaturated greens, brown.
- Particles: dust motes, tan/brown.

**Hand-tuning:** Fix tile edges, adjust background brightness.

### M7.3 · Lava theme

**AI generation:**
- Tile atlas: volcanic rock, glowing orange cracks. 512×32.
- Background: lava cavern, dark with orange glow at bottom. 256×256.
- Midground: stalactite silhouettes. 512×256.
- Palette: black, dark red, glowing orange.
- Particles: embers floating upward, orange-red.

### M7.4 · Ice theme

**AI generation:**
- Tile atlas: ice blocks, blue-white, crystal edges. 512×32.
- Background: ice cavern, cool blue tones. 256×256.
- Midground: frozen formations. 512×256.
- Palette: white, light blue, pale cyan, deep navy.
- Particles: snowflakes drifting.

### M7.5 · Sci-fi theme (refine M3.1)

- Polish the initial sci-fi tiles.
- Add glowing edge strips on top-edge tiles (2px neon cyan line).
- Background: starfield + machinery.

**Checkpoint:** 4 distinct visual themes. Dopamine: "Every map feels different."

---

## PHASE 8 — FINAL POLISH (Days 32–36)

### M8.1 · Camera smoothing + deadzone

- Smooth follow: `camX += (targetX - camX) * 0.12` per frame.
- Deadzone: camera doesn't move when player is within 64×32px rect of center.
- Lookahead: shift 32px in facing direction.

### M8.2 · Beam rendering upgrade

- Rail: shimmer effect — per-frame jitter offset on the beam (random normal ±2px).
- Shaft: wobbly inner beam, offset each segment by random ±2.5px.
- Additive glow layer behind both beams.

### M8.3 · Item pickup flash

- When player picks up an item: brief white flash at item position + "+25" rising text.
- Mega health / Quad: more dramatic — ring expansion + particles.

### M8.4 · Run animation speed matching

- Walk frame rate should match actual velocity.
- `frameDuration = max(1, floor(3 / (|vx| / maxVx + 0.01)))` — faster run = faster animation.
- Idle → run transition: play first 2 frames faster (startup).

### M8.5 · Player skins

- 6 color variants of each sprite sheet.
- AI generates base skin, then you palette-swap.
- Palette swap technique: draw sprite to offscreen canvas, use `getImageData` / `putImageData` to remap specific hue ranges.
- Or simpler: generate all 6 with AI, hand-fix each.

### M8.6 · Performance pass

- Cache static elements: draw tiles to an offscreen canvas once on map load, blit each frame.
- Object pooling: reuse particle objects instead of allocating.
- Only draw entities/projectiles/FX within viewport bounds (frustum cull).
- Profile with Chrome DevTools — target: <2ms total render time at 60fps.

### M8.7 · Settings menu hookup

- Rail trail color: user-selectable.
- Rail trail duration: configurable (default 11 ticks).
- Screen shake: on/off toggle.
- Show FPS: toggle.

**Checkpoint:** Production quality. Dopamine: "I built this whole renderer from scratch."

---

## DAILY WORKFLOW

Each session:

1. Pick the next milestone.
2. **Ask Claude** to generate the code / sprite prompt.
3. Integrate and test — does it run? Does it look right?
4. **Hand-tune** if needed (sprite alignment, color values, timing).
5. Commit with milestone tag: `git commit -m "M2.3: player body shapes"`.
6. Screenshot before/after. Keep a visual changelog.

---

## AI PROMPTING TEMPLATES

### For code generation (Claude)
```
I'm building milestone M[X.Y] of my Canvas game renderer.
Context: [paste relevant constants + current code structure]
Generate: [specific function/module needed]
Constraints: No PixiJS. Raw Canvas 2D. No comments.
Constants: TILE_W=32, TILE_H=16, PLAYER_HALF_W=9, PLAYER_HALF_H=24.
```

### For sprite sheet generation (image AI)
```
Pixel art sprite sheet, [SUBJECT], [FRAME_COUNT] frames,
each frame [W]×[H] pixels, arranged horizontally,
transparent background, side view facing right,
[STYLE: sci-fi armored soldier / stone brick / etc],
consistent lighting from top-left, clean pixel edges,
no anti-aliasing, limited palette (16-24 colors).
```

### For background textures (image AI)
```
Seamless tileable texture, [SIZE]×[SIZE] pixels,
[THEME: dark sci-fi metal panels / ancient stone wall / volcanic rock],
very dark overall (average brightness <30/255),
subtle detail, game background, must tile perfectly.
```

---

## MILESTONE CHECKLIST

```
PHASE 0 — BARE CANVAS
[ ] M0.1  Canvas bootstrap
[ ] M0.2  Map as colored rectangles
[ ] M0.3  Player as rectangle
[ ] M0.4  Camera/viewport
[ ] M0.5  All entities

PHASE 1 — READABLE GAME
[ ] M1.1  Projectile rectangles
[ ] M1.2  Hitscan lines
[ ] M1.3  Explosion circles
[ ] M1.4  Bullet impact dots
[ ] M1.5  Basic HUD
[ ] M1.6  Crosshair

PHASE 2 — SHAPE & SHADING
[ ] M2.1  Brick tiles with depth
[ ] M2.2  Auto-tiling
[ ] M2.3  Player body shape
[ ] M2.4  Weapon shapes
[ ] M2.5  Projectile shapes with glow
[ ] M2.6  Smoke trails
[ ] M2.7  Multi-layer explosions

PHASE 3 — SPRITE ASSETS
[ ] M3.1  Tile sprite atlas
[ ] M3.2  Player walk cycle
[ ] M3.3  Player idle
[ ] M3.4  Player jump + fall
[ ] M3.5  Player crouch + die
[ ] M3.6  Weapon sprites
[ ] M3.7  Projectile sprites
[ ] M3.8  Item/pickup sprites

PHASE 4 — EFFECTS POLISH
[ ] M4.1  Muzzle flash
[ ] M4.2  Screen shake
[ ] M4.3  Damage flash
[ ] M4.4  Spawn protection glow
[ ] M4.5  Quad damage effect
[ ] M4.6  Landing dust
[ ] M4.7  Grenade bounce spark
[ ] M4.8  Death effect

PHASE 5 — BACKGROUNDS
[ ] M5.1  Gradient background
[ ] M5.2  Procedural starfield
[ ] M5.3  Tiling background texture
[ ] M5.4  Parallax mid-layer
[ ] M5.5  Ambient particles

PHASE 6 — HUD POLISH
[ ] M6.1  Styled health/armor bars
[ ] M6.2  Weapon rack display
[ ] M6.3  Kill feed styling
[ ] M6.4  Timer and score
[ ] M6.5  Respawn overlay

PHASE 7 — THEMES
[ ] M7.1  Theme system
[ ] M7.2  Ruins theme
[ ] M7.3  Lava theme
[ ] M7.4  Ice theme
[ ] M7.5  Sci-fi theme polish

PHASE 8 — FINAL POLISH
[ ] M8.1  Camera smoothing
[ ] M8.2  Beam rendering upgrade
[ ] M8.3  Item pickup flash
[ ] M8.4  Run animation speed matching
[ ] M8.5  Player skins
[ ] M8.6  Performance pass
[ ] M8.7  Settings menu hookup
```

**Total: 45 milestones across 8 phases, ~36 sessions.**
import { Graphics } from 'pixi.js'
import { app, tilesLayer, entitiesLayer, world } from './app'
import { Map } from '#/game/map'
import { Player } from '#/game/player'
import { Physics } from '#/game/physics'
import { Input, Settings } from '#/core/helpers'
import { getWasmModuleSync } from '#/wasm/client'
import { TILE_W, TILE_H, PLAYER_HALF_H, SPAWN_OFFSET_X } from './constants'

const AIM_INPUT_SCALE = 0.5
const MAX_AIM_DELTA = 12
const AIM_LINE_LEN = 50
const PLAYER_COLOR = 0x00ffcc

const wasm = getWasmModuleSync()
const hitboxScratch = new Float32Array(4)

// --- Init ---
await Map.loadFromQuery()
Physics.setMap(Map.getRows(), Map.getCols(), Map.getBricksFlat())

const rows = Map.getRows()
const cols = Map.getCols()
const mapPixelW = cols * TILE_W
const mapPixelH = rows * TILE_H

const player = new Player()
spawnPlayer()

// --- Static map (drawn once) ---
const mapGfx = new Graphics()
for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
        if (!Map.isBrick(col, row)) continue
        const color = Map.getTileColor(col, row) ?? 0x00ff88
        mapGfx
            .rect(col * TILE_W, row * TILE_H, TILE_W, TILE_H)
            .fill({ color })
            .stroke({ width: 1, color, alpha: 0.4 })
    }
}
tilesLayer.addChild(mapGfx)

// --- Player graphics (redrawn each frame) ---
const playerGfx = new Graphics()
entitiesLayer.addChild(playerGfx)

// --- Pointer lock ---
document.getElementById('game')?.addEventListener('click', () => {
    const canvas = document.querySelector('#game canvas') as HTMLCanvasElement | null
    if (canvas && document.pointerLockElement !== canvas) canvas.requestPointerLock()
})

// Track last mouse Y for non-locked aim fallback
let lastMouseY = Input.mouseY

// --- Game loop ---
app.ticker.add((ticker) => {
    const timestamp = ticker.lastTime

    player.prevX = player.x
    player.prevY = player.y
    player.prevAimAngle = player.aimAngle

    processMovement()
    processAim()

    const steps = Physics.consumeTicks(timestamp)
    for (let i = 0; i < steps; i++) {
        player.update()
        if (player.checkRespawn()) spawnPlayer()
        Physics.stepPlayers([player], 1)
    }

    const alpha = Physics.getAlpha()
    const rx = player.prevX + (player.x - player.prevX) * alpha
    const ry = player.prevY + (player.y - player.prevY) * alpha
    const ra = player.prevAimAngle + (player.aimAngle - player.prevAimAngle) * alpha

    drawPlayer(rx, ry, ra)
    updateCamera(rx, ry)
})

// --- Helpers ---

function spawnPlayer() {
    const spawn = Map.getRandomRespawn()
    if (spawn) {
        player.setXY(spawn.col * TILE_W + SPAWN_OFFSET_X, spawn.row * TILE_H - PLAYER_HALF_H)
    }
    player.prevX = player.x
    player.prevY = player.y
}

function processMovement() {
    player.keyUp = Input.keyUp
    player.keyDown = Input.keyDown
    player.keyLeft = Input.keyLeft
    player.keyRight = Input.keyRight
}

function processAim() {
    const rawDelta = Input.pointerLocked
        ? (() => {
              const d = Input.mouseDeltaY
              Input.mouseDeltaY = 0
              return d
          })()
        : (() => {
              const d = Input.mouseY - lastMouseY
              lastMouseY = Input.mouseY
              return d
          })()

    if (rawDelta !== 0) {
        const capped = Math.max(-MAX_AIM_DELTA, Math.min(MAX_AIM_DELTA, rawDelta))
        player.updateAimAngle(
            capped * Settings.aimSensitivity * AIM_INPUT_SCALE * (player.facingLeft ? -1 : 1),
            player.facingLeft,
        )
    }

    // Facing direction follows movement keys
    const moveDir = Input.keyLeft ? -1 : Input.keyRight ? 1 : 0
    if (moveDir !== 0) {
        const newFacingLeft = moveDir < 0
        if (newFacingLeft !== player.facingLeft) {
            player.aimAngle = normalizeAngle(Math.PI - player.aimAngle)
            player.prevAimAngle = player.aimAngle
        }
        player.facingLeft = newFacingLeft
    }
}

function drawPlayer(rx: number, ry: number, ra: number) {
    playerGfx.clear()

    // Ask WASM for the exact hitbox at the interpolated render position
    wasm.wasm_player_hitbox(rx, ry, player.crouch ?? false, 0, hitboxScratch)
    const minX = hitboxScratch[0]
    const maxX = hitboxScratch[1]
    const minY = hitboxScratch[2]
    const maxY = hitboxScratch[3]

    if (player.dead) {
        playerGfx
            .moveTo(minX, maxY)
            .lineTo(maxX, maxY)
            .stroke({ width: 1, color: PLAYER_COLOR, alpha: 0.3 })
        return
    }

    // Wireframe rect = exact physics hitbox
    playerGfx.rect(minX, minY, maxX - minX, maxY - minY).stroke({ width: 1, color: PLAYER_COLOR })

    playerGfx
        .moveTo(rx, ry)
        .lineTo(rx + Math.cos(ra) * AIM_LINE_LEN, ry + Math.sin(ra) * AIM_LINE_LEN)
        .stroke({ width: 1, color: PLAYER_COLOR, alpha: 0.3 })
}

// Fixed zoom for large (scrolling) maps: always shows 28 tiles across
const TILES_VISIBLE_X = 28
const CAMERA_ZOOM = app.screen.width / (TILES_VISIBLE_X * TILE_W)

function updateCamera(rx: number, ry: number) {
    const cw = app.screen.width
    const ch = app.screen.height

    if (cols <= TILES_VISIBLE_X) {
        // Small map: scale to fit the viewport entirely, center, cap at CAMERA_ZOOM
        const zoom = Math.min(cw / mapPixelW, ch / mapPixelH, CAMERA_ZOOM)
        world.scale.set(zoom)
        world.x = (cw - mapPixelW * zoom) / 2
        world.y = (ch - mapPixelH * zoom) / 2
    } else {
        // Large map: fixed zoom, track player, clamp to map edges
        const sw = mapPixelW * CAMERA_ZOOM
        const sh = mapPixelH * CAMERA_ZOOM
        world.scale.set(CAMERA_ZOOM)
        world.x = Math.min(0, Math.max(cw - sw, cw / 2 - rx * CAMERA_ZOOM))
        world.y =
            sh > ch ? Math.min(0, Math.max(ch - sh, ch / 2 - ry * CAMERA_ZOOM)) : (ch - sh) / 2
    }
}

function normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2
    while (a < -Math.PI) a += Math.PI * 2
    return a
}

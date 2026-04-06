import { Graphics, Sprite } from 'pixi.js'
import { app, tilesLayer, entitiesLayer, world, debugLayer, setCullArea } from './app'
import { Camera } from './camera'
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
const camera = new Camera()

await Map.loadFromQuery()
Physics.setMap(Map.getRows(), Map.getCols(), Map.getBricksFlat())

const rows = Map.getRows()
const cols = Map.getCols()
const mapPixelW = cols * TILE_W
const mapPixelH = rows * TILE_H

setCullArea(mapPixelW, mapPixelH)

const player = new Player()
spawnPlayer()

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
const mapTexture = app.renderer.generateTexture(mapGfx)
tilesLayer.addChild(new Sprite(mapTexture))
mapGfx.destroy()

const sharedGfx = new Graphics()
entitiesLayer.addChild(sharedGfx)

const debugGfx = new Graphics()
debugLayer.addChild(debugGfx)

let lastMouseY = Input.mouseY
let debugVisible = false

document.getElementById('game')?.addEventListener('click', () => {
    const canvas = document.querySelector('#game canvas') as HTMLCanvasElement | null
    if (canvas && document.pointerLockElement !== canvas) canvas.requestPointerLock()
})

document.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
        debugVisible = !debugVisible
        if (!debugVisible) debugGfx.clear()
    }
})

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

    sharedGfx.clear()
    drawPlayer(sharedGfx, rx, ry, ra, player.crouch, player.dead)

    camera.update(rx, ry, app.screen.width, app.screen.height, mapPixelW, mapPixelH, cols)
    camera.apply(world)

    if (debugVisible) drawDebug()
})

function spawnPlayer(): void {
    const spawn = Map.getRandomRespawn()
    if (spawn) {
        player.setXY(spawn.col * TILE_W + SPAWN_OFFSET_X, spawn.row * TILE_H - PLAYER_HALF_H)
    }
    player.prevX = player.x
    player.prevY = player.y
}

function processMovement(): void {
    player.keyUp = Input.keyUp
    player.keyDown = Input.keyDown
    player.keyLeft = Input.keyLeft
    player.keyRight = Input.keyRight
}

function consumeAimDelta(): number {
    if (Input.pointerLocked) {
        const d = Input.mouseDeltaY
        Input.mouseDeltaY = 0
        return d
    }
    const d = Input.mouseY - lastMouseY
    lastMouseY = Input.mouseY
    return d
}

function processAim(): void {
    const rawDelta = consumeAimDelta()
    if (rawDelta !== 0) {
        const capped = Math.max(-MAX_AIM_DELTA, Math.min(MAX_AIM_DELTA, rawDelta))
        player.updateAimAngle(
            capped * Settings.aimSensitivity * AIM_INPUT_SCALE * (player.facingLeft ? -1 : 1),
            player.facingLeft,
        )
    }

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

function drawPlayer(
    gfx: Graphics,
    rx: number,
    ry: number,
    ra: number,
    crouch: boolean,
    dead: boolean,
): void {
    wasm.wasm_player_hitbox(rx, ry, crouch, 0, hitboxScratch)
    const minX = hitboxScratch[0]
    const maxX = hitboxScratch[1]
    const minY = hitboxScratch[2]
    const maxY = hitboxScratch[3]

    if (dead) {
        gfx.moveTo(minX, maxY)
            .lineTo(maxX, maxY)
            .stroke({ width: 1, color: PLAYER_COLOR, alpha: 0.3 })
        return
    }

    gfx.rect(minX, minY, maxX - minX, maxY - minY).stroke({ width: 1, color: PLAYER_COLOR })
    gfx.moveTo(rx, ry)
        .lineTo(rx + Math.cos(ra) * AIM_LINE_LEN, ry + Math.sin(ra) * AIM_LINE_LEN)
        .stroke({ width: 1, color: PLAYER_COLOR, alpha: 0.3 })
}

function drawDebug(): void {
    debugGfx.clear()
    wasm.wasm_player_hitbox(player.x, player.y, player.crouch, 0, hitboxScratch)
    const sx = (wx: number) => camera.x + wx * camera.zoom
    const sy = (wy: number) => camera.y + wy * camera.zoom
    debugGfx
        .rect(sx(hitboxScratch[0]), sy(hitboxScratch[2]), (hitboxScratch[1] - hitboxScratch[0]) * camera.zoom, (hitboxScratch[3] - hitboxScratch[2]) * camera.zoom)
        .stroke({ width: 1, color: 0xff0000, alpha: 0.8 })
    debugGfx.circle(sx(player.x), sy(player.y), 3).fill({ color: 0xff0000 })
}

function normalizeAngle(a: number): number {
    a = a % (Math.PI * 2)
    if (a > Math.PI) a -= Math.PI * 2
    if (a < -Math.PI) a += Math.PI * 2
    return a
}

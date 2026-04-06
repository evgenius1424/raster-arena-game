import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { Map as GameMap } from '#/game/map'
import { TILE_W, TILE_H } from './constants'

const BODY_TOP_R = 56, BODY_TOP_G = 56, BODY_TOP_B = 74
const BODY_BOT_R = 26, BODY_BOT_G = 26, BODY_BOT_B = 36

const EDGE_BOTTOM = 0x1a1a2c
const EDGE_RIGHT  = 0x1e1e30
const EDGE_LEFT   = 0x404058
const SEAM_COLOR  = 0x2e2e42

const GLOW_SPREAD = 6

const DEFAULT_GLOW = 0x00ff88
const DEFAULT_CORE = 0x88ffcc

const atlasCache = new Map<number, Texture[]>()

export function buildMapSprite(app: Application, rows: number, cols: number): Sprite {
    const masks = analyzeMap(rows, cols)

    const colorSet = new Set<number>()
    colorSet.add(DEFAULT_GLOW)
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (masks[row][col] === -1) continue
            const tint = GameMap.getTileColor(col, row)
            if (tint !== null) colorSet.add(tint)
        }
    }

    for (const glow of colorSet) {
        if (!atlasCache.has(glow)) {
            atlasCache.set(glow, generateAtlas(app, glow))
        }
    }

    const container = new Container()

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const mask = masks[row][col]
            if (mask === -1) continue

            const tint = GameMap.getTileColor(col, row)
            const glow = tint !== null ? tint : DEFAULT_GLOW
            const atlas = atlasCache.get(glow)!

            const sprite = new Sprite(atlas[mask])
            sprite.x = col * TILE_W
            sprite.y = row * TILE_H
            container.addChild(sprite)
        }
    }

    const bakedTexture = app.renderer.generateTexture(container)
    bakedTexture.source.scaleMode = 'nearest'
    const result = new Sprite(bakedTexture)
    container.destroy({ children: true })
    return result
}

function analyzeMap(rows: number, cols: number): number[][] {
    const masks: number[][] = []
    for (let row = 0; row < rows; row++) {
        masks[row] = []
        for (let col = 0; col < cols; col++) {
            if (!GameMap.isBrick(col, row)) {
                masks[row][col] = -1
                continue
            }
            let mask = 0
            if (GameMap.isBrick(col, row - 1)) mask |= 1
            if (GameMap.isBrick(col + 1, row)) mask |= 2
            if (GameMap.isBrick(col, row + 1)) mask |= 4
            if (GameMap.isBrick(col - 1, row)) mask |= 8
            masks[row][col] = mask
        }
    }
    return masks
}

function generateAtlas(app: Application, glow: number): Texture[] {
    const atlas: Texture[] = []
    const g = new Graphics()
    const core = blendToWhite(glow, 0.45)

    for (let mask = 0; mask < 16; mask++) {
        g.clear()
        drawTileVariant(g, mask, glow, core)
        const tex = app.renderer.generateTexture(g)
        tex.source.scaleMode = 'nearest'
        atlas.push(tex)
    }

    g.destroy()
    return atlas
}

function drawTileVariant(g: Graphics, mask: number, glow: number, core: number): void {
    const noTop    = (mask & 1) === 0
    const noRight  = (mask & 2) === 0
    const noBottom = (mask & 4) === 0
    const noLeft   = (mask & 8) === 0

    for (let row = 0; row < TILE_H; row++) {
        const t = row / (TILE_H - 1)
        const color = lerpRGB(BODY_TOP_R, BODY_TOP_G, BODY_TOP_B, BODY_BOT_R, BODY_BOT_G, BODY_BOT_B, t)
        g.rect(0, row, TILE_W, 1).fill({ color })
    }

    g.rect(0, 0,              TILE_W, 1).fill({ color: noTop    ? lerpRGB(BODY_TOP_R, BODY_TOP_G, BODY_TOP_B, BODY_BOT_R, BODY_BOT_G, BODY_BOT_B, 0) : SEAM_COLOR })
    g.rect(0, TILE_H - 1,     TILE_W, 1).fill({ color: noBottom ? EDGE_BOTTOM : SEAM_COLOR })
    g.rect(TILE_W - 1, 0,     1, TILE_H).fill({ color: noRight  ? EDGE_RIGHT : SEAM_COLOR })
    g.rect(0, 0,              1, TILE_H).fill({ color: noLeft   ? EDGE_LEFT  : SEAM_COLOR })

    if (noTop) {
        for (let row = 0; row < GLOW_SPREAD; row++) {
            const t = row / (GLOW_SPREAD - 1)
            const falloff = Math.pow(1 - t, 2.2)
            if (row === 0) {
                g.rect(0, row, TILE_W, 1).fill({ color: core, alpha: falloff * 0.95 })
            } else {
                g.rect(0, row, TILE_W, 1).fill({ color: glow, alpha: falloff * 0.6 })
            }
        }
    }

    if (noLeft) {
        for (let col = 0; col < 3; col++) {
            const t = col / 2
            const a = Math.pow(1 - t, 2.0) * 0.4
            g.rect(col, 0, 1, TILE_H).fill({ color: glow, alpha: a })
        }
    }

    if (noTop && noLeft) {
        g.rect(0, 0, 2, 2).fill({ color: core, alpha: 0.5 })
    }

    if (noTop && noRight) {
        g.rect(TILE_W - 2, 0, 2, 2).fill({ color: core, alpha: 0.3 })
    }

    if (mask === 15) {
        g.rect(TILE_W / 2, 0, 1, TILE_H).fill({ color: SEAM_COLOR })
        g.rect(0, TILE_H / 2, TILE_W, 1).fill({ color: SEAM_COLOR })
    }
}

function blendToWhite(color: number, t: number): number {
    const r = (color >> 16) & 0xff
    const g = (color >> 8) & 0xff
    const b = color & 0xff
    return (Math.round(r + (255 - r) * t) << 16)
        | (Math.round(g + (255 - g) * t) << 8)
        | Math.round(b + (255 - b) * t)
}

function lerpRGB(
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number,
    t: number,
): number {
    const r = Math.round(r1 + (r2 - r1) * t)
    const g = Math.round(g1 + (g2 - g1) * t)
    const b = Math.round(b1 + (b2 - b1) * t)
    return (r << 16) | (g << 8) | b
}

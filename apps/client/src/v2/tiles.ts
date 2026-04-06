import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { Map as GameMap } from '#/game/map'
import { TILE_W, TILE_H } from './constants'

const BODY_DARK    = 0x1e1e2e
const BODY_MID     = 0x2a2a3e
const SHADOW_DEEP  = 0x0a0a14
const PANEL_LINE   = 0x222236

const DEFAULT_GLOW = 0x00ff88
const DEFAULT_CORE = 0x88ffcc

const CRACK_OFFSETS = [0, -2, 1, -1]

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
        atlas.push(app.renderer.generateTexture(g))
    }

    g.destroy()
    return atlas
}

function drawTileVariant(g: Graphics, mask: number, glow: number, core: number): void {
    const noTop    = (mask & 1) === 0
    const noRight  = (mask & 2) === 0
    const noBottom = (mask & 4) === 0
    const noLeft   = (mask & 8) === 0

    g.rect(0, 0, TILE_W, TILE_H).fill({ color: BODY_DARK })
    if (noTop) {
        g.rect(1, 1, TILE_W - 2, 4).fill({ color: BODY_MID })
    } else {
        g.rect(1, 1, TILE_W - 2, 3).fill({ color: BODY_MID, alpha: 0.5 })
    }

    // Step 4 — platform lip (exposed top)
    if (noTop) {
        g.rect(0, 0, TILE_W, 4).fill({ color: glow, alpha: 0.3 })
        g.rect(0, 0, TILE_W, 2).fill({ color: glow, alpha: 0.6 })
        g.rect(0, 0, TILE_W, 1).fill({ color: core, alpha: 0.95 })
    }

    // Step 5 — side edges
    if (noLeft) {
        g.rect(0, 0, 2, TILE_H).fill({ color: glow, alpha: 0.12 })
        g.rect(0, 0, 1, TILE_H).fill({ color: glow, alpha: 0.4 })
    }
    if (noRight) {
        g.rect(TILE_W - 1, 0, 1, TILE_H).fill({ color: SHADOW_DEEP, alpha: 0.7 })
    }
    if (noBottom) {
        g.rect(0, TILE_H - 2, TILE_W, 2).fill({ color: SHADOW_DEEP, alpha: 0.5 })
        g.rect(0, TILE_H - 1, TILE_W, 1).fill({ color: SHADOW_DEEP, alpha: 0.8 })
    }

    // Step 6 — corner intersections
    if (noTop && noLeft)    g.rect(0, 0, 3, 3).fill({ color: core, alpha: 0.6 })
    if (noTop && noRight)   g.rect(TILE_W - 3, 0, 3, 3).fill({ color: core, alpha: 0.35 })
    if (noBottom && noRight) g.rect(TILE_W - 2, TILE_H - 2, 2, 2).fill({ color: SHADOW_DEEP, alpha: 0.5 })
    if (noBottom && noLeft)  g.rect(0, TILE_H - 2, 2, 2).fill({ color: SHADOW_DEEP, alpha: 0.3 })

    if (mask === 15) {
        g.rect(Math.round(TILE_W / 2), 0, 1, TILE_H).fill({ color: PANEL_LINE, alpha: 0.03 })
        g.rect(0, Math.round(TILE_H / 2), TILE_W, 1).fill({ color: PANEL_LINE, alpha: 0.03 })
    }

    // Step 8 — crack decal (exposed top and bottom only)
    if (mask === 5) {
        const segH = TILE_H / 4
        const cx = TILE_W / 2
        for (let i = 0; i < 4; i++) {
            const x = cx + CRACK_OFFSETS[i]
            g.moveTo(x, i * segH).lineTo(x, (i + 1) * segH)
                .stroke({ width: 1, color: SHADOW_DEEP, alpha: 0.7 })
        }
    }

    // Step 9 — ceiling underside accent (solid above, exposed below)
    if (noBottom && !noTop) {
        g.rect(0, TILE_H - 1, TILE_W, 1).fill({ color: glow, alpha: 0.08 })
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

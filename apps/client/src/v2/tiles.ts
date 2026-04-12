import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { Map as GameMap } from '#/game/map'
import { TILE_W, TILE_H } from './constants'

const COLOR_BODY = 0x2c3245
const COLOR_BODY_DARK = 0x242a3a
const COLOR_GROOVE = 0x1a1f2c
const COLOR_HIGHLIGHT = 0x3a4258

const DEFAULT_GLOW = 0x00e5ff

const SCALE_FACTOR = 2
const atlasCache = new Map<number, Texture[]>()

export function buildMapSprite(app: Application, rows: number, cols: number): Sprite {
    const masks = analyzeMap(rows, cols)
    const colorSet = new Set<number>([DEFAULT_GLOW])

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
            sprite.width = TILE_W
            sprite.height = TILE_H
            container.addChild(sprite)
        }
    }

    const bakedTexture = app.renderer.generateTexture(container)
    bakedTexture.source.scaleMode = 'linear'
    const result = new Sprite(bakedTexture)
    container.destroy({ children: true })
    return result
}

function generateAtlas(app: Application, glow: number): Texture[] {
    const atlas: Texture[] = []
    const g = new Graphics()
    const core = blendToWhite(glow, 0.5)

    for (let mask = 0; mask < 16; mask++) {
        g.clear()
        drawTile(g, mask, glow, core)
        const tex = app.renderer.generateTexture({ target: g, resolution: 1 })
        atlas.push(tex)
    }
    g.destroy()
    return atlas
}

function drawTile(g: Graphics, mask: number, glow: number, core: number): void {
    const W = TILE_W * SCALE_FACTOR
    const H = TILE_H * SCALE_FACTOR
    const S = SCALE_FACTOR

    const hasTop = (mask & 1) !== 0
    const hasRight = (mask & 2) !== 0
    const hasBottom = (mask & 4) !== 0
    const hasLeft = (mask & 8) !== 0

    g.rect(0, 0, W, H).fill({ color: COLOR_BODY })
    g.rect(0, H * 0.5, W, H * 0.5).fill({ color: COLOR_BODY_DARK, alpha: 0.5 })

    drawPanelGrooves(g, W, H, S)
    drawEdges(g, W, H, S, hasTop, hasRight, hasBottom, hasLeft, glow, core)
}

function drawPanelGrooves(g: Graphics, W: number, H: number, S: number): void {
    const inset = 3 * S
    const x0 = inset
    const y0 = inset
    const pw = W - inset * 2
    const ph = H - inset * 2

    if (pw < 4 * S || ph < 2 * S) return

    g.rect(x0, y0, pw, ph).stroke({ color: COLOR_GROOVE, width: S * 0.5, alpha: 0.7 })
    g.rect(x0 + S, y0 + S, pw - 2 * S, ph - 2 * S).fill({ color: COLOR_HIGHLIGHT, alpha: 0.06 })

    const midX = Math.round(x0 + pw * 0.5)
    g.moveTo(midX, y0)
        .lineTo(midX, y0 + ph)
        .stroke({ color: COLOR_GROOVE, width: S * 0.5, alpha: 0.4 })
}

function drawEdges(
    g: Graphics,
    W: number,
    H: number,
    S: number,
    hasTop: boolean,
    hasRight: boolean,
    hasBottom: boolean,
    hasLeft: boolean,
    glow: number,
    core: number,
): void {
    if (!hasTop) {
        for (let i = 0; i < 6 * S; i++) {
            const a = (1 - i / (6 * S)) * 0.5
            g.rect(0, i, W, 1).fill({ color: glow, alpha: a })
        }
        g.rect(0, 0, W, S).fill({ color: core })
    } else {
        g.rect(0, 0, W, 1).fill({ color: COLOR_GROOVE, alpha: 0.4 })
    }

    if (!hasBottom) {
        g.rect(0, H - 2 * S, W, 2 * S).fill({ color: 0x0e1018, alpha: 0.7 })
    } else {
        g.rect(0, H - 1, W, 1).fill({ color: COLOR_GROOVE, alpha: 0.4 })
    }

    if (!hasLeft) {
        g.rect(0, 0, S, H).fill({ color: COLOR_HIGHLIGHT, alpha: 0.35 })
    } else {
        g.rect(0, 0, 1, H).fill({ color: COLOR_GROOVE, alpha: 0.35 })
    }

    if (!hasRight) {
        g.rect(W - S, 0, S, H).fill({ color: 0x0e1018, alpha: 0.5 })
    } else {
        g.rect(W - 1, 0, 1, H).fill({ color: COLOR_GROOVE, alpha: 0.35 })
    }
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

function blendToWhite(color: number, t: number): number {
    const r = (color >> 16) & 0xff,
        g = (color >> 8) & 0xff,
        b = color & 0xff
    return (
        (Math.round(r + (255 - r) * t) << 16) |
        (Math.round(g + (255 - g) * t) << 8) |
        Math.round(b + (255 - b) * t)
    )
}

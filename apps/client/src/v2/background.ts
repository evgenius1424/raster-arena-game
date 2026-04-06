import { Application, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js'
import { bgLayer, bgDecorLayer, fgDecorLayer, hudLayer } from './app'

let farSprite: TilingSprite | null = null
let citySprite: TilingSprite | null = null
let particles: Sprite[] = []
let sharedDotTex: Texture | null = null

export function initBackground(
    app: Application,
    screenW: number,
    screenH: number,
    mapW: number,
    mapH: number,
): void {
    buildGradientLayer(app, screenW, screenH)
    buildStarfieldLayer(app, screenW, screenH)
    buildFarStructuresLayer(app, screenW, screenH)
    buildCityLayer(app, screenW, screenH)
    buildParticleLayer(app, mapW, mapH)
    buildFogLayer(app, mapW, mapH)
    buildVignetteLayer(app, screenW, screenH)
}

export function updateBackground(cameraX: number, cameraY: number, tick: number): void {
    if (farSprite) farSprite.tilePosition.x = -cameraX * 0.03
    if (citySprite) citySprite.tilePosition.x = -cameraX * 0.08

    for (let i = 0; i < particles.length; i++) {
        particles[i].alpha = 0.06 + 0.04 * Math.sin(tick * 0.015 + i * 0.8)
    }
}

function buildGradientLayer(app: Application, screenW: number, screenH: number): void {
    const g = new Graphics()
    const mid = Math.round(screenH / 2)
    g.rect(0, 0, screenW, mid).fill({ color: 0x04040c })
    g.rect(0, mid - 1, screenW, screenH - mid + 1).fill({ color: 0x0c0c1e })
    g.rect(0, mid - 20, screenW, 40).fill({ color: 0x080814, alpha: 0.5 })
    const tex = app.renderer.generateTexture(g)
    g.destroy()
    bgLayer.addChild(new Sprite(tex))
}

function buildStarfieldLayer(app: Application, screenW: number, screenH: number): void {
    const g = new Graphics()
    const COUNT = 250

    for (let i = 0; i < COUNT; i++) {
        const cls = (i * 31) % 20
        const x = (i * 1531 + 173) % screenW
        const y = (i * 947 + 311) % screenH

        if (cls <= 13) {
            const alpha = 0.1 + ((i * 271) % 100) / 100 * 0.2
            g.circle(x, y, 0.5).fill({ color: 0xaaaacc, alpha })
        } else if (cls <= 18) {
            const alpha = 0.2 + ((i * 271) % 100) / 100 * 0.3
            g.circle(x, y, 1.0).fill({ color: 0xccccee, alpha })
        } else {
            const alpha = 0.5 + ((i * 271) % 100) / 100 * 0.3
            g.circle(x, y, 1.5).fill({ color: 0xffffff, alpha })
        }
    }

    const tex = app.renderer.generateTexture(g)
    g.destroy()
    bgLayer.addChild(new Sprite(tex))
}

function buildFarStructuresLayer(app: Application, screenW: number, screenH: number): void {
    const texW = Math.round(screenW * 1.5)
    const g = new Graphics()
    let seed = 99991
    const COUNT = 7

    for (let i = 0; i < COUNT; i++) {
        seed = lcg(seed)
        const bw = 80 + (seed % 80)
        seed = lcg(seed)
        const bh = 80 + ((((i * 7 + 3) * 17) % 13) / 13) * 120
        const bx = Math.round((i / COUNT) * texW + (seed % 40) - 20)
        const by = Math.round(screenH * 0.3 - bh)

        g.rect(bx, by, bw, bh).fill({ color: 0x090912 })
        g.rect(bx, by, bw, 1).fill({ color: 0x181828 })

        seed = lcg(seed)
        if (seed % 3 === 0) {
            const dotX = bx + Math.round(bw / 2)
            g.rect(dotX, by + 4, 2, 2).fill({ color: 0x224444, alpha: 0.2 })
        }
    }

    const tex = app.renderer.generateTexture(g)
    g.destroy()

    farSprite = new TilingSprite({ texture: tex, width: screenW, height: screenH })
    bgLayer.addChild(farSprite)
}

function buildCityLayer(app: Application, screenW: number, screenH: number): void {
    const texW = 640
    const texH = Math.round(screenH * 0.55)
    const g = new Graphics()
    let seed = 54321
    const COUNT = 25

    for (let i = 0; i < COUNT; i++) {
        seed = lcg(seed)
        const bw = 14 + (seed % 18)
        seed = lcg(seed)
        const bh = 30 + (seed % 110)
        const bx = Math.round((i / COUNT) * texW + (seed % 10))
        const by = texH - bh

        g.rect(bx, by, bw, bh).fill({ color: 0x0a0a16 })
        g.rect(bx, by, bw, 1).fill({ color: 0x1a1a2e })

        const wcols = Math.max(1, Math.floor((bw - 4) / 6))
        const wrows = Math.max(1, Math.floor((bh - 6) / 8))
        for (let wr = 0; wr < wrows; wr++) {
            for (let wc = 0; wc < wcols; wc++) {
                const wx = bx + 2 + wc * 6
                const wy = by + 4 + wr * 8
                seed = lcg(seed)
                const wIdx = i * wrows * wcols + wr * wcols + wc
                if (wIdx % 7 === 0) {
                    g.rect(wx, wy, 2, 2).fill({ color: 0x446688, alpha: 0.25 })
                } else if (seed % 3 === 0) {
                    g.rect(wx, wy, 2, 2).fill({ color: 0x222244, alpha: 0.15 })
                }
            }
        }

        if (i % 8 === 0) {
            g.rect(bx, by, bw, 1).fill({ color: 0x00ff88, alpha: 0.06 })
        }
    }

    const tex = app.renderer.generateTexture(g)
    g.destroy()

    const cityH = texH
    citySprite = new TilingSprite({ texture: tex, width: screenW, height: cityH })
    citySprite.y = screenH - cityH
    citySprite.alpha = 0.35
    bgLayer.addChild(citySprite)
}

function buildParticleLayer(app: Application, mapW: number, mapH: number): void {
    const dotTex = generateDotTexture(app)
    sharedDotTex = dotTex
    const COUNT = 80
    let seed = 31337

    for (let i = 0; i < COUNT; i++) {
        seed = lcg(seed)
        const px = seed % mapW
        seed = lcg(seed)
        const py = seed % mapH

        const s = new Sprite(dotTex)
        s.anchor.set(0.5)
        s.x = px
        s.y = py
        s.tint = 0x446688
        s.alpha = 0.06

        bgDecorLayer.addChild(s)
        particles.push(s)
    }
}

function buildFogLayer(app: Application, mapW: number, mapH: number): void {
    const g = new Graphics()
    const h1 = Math.round(mapH * 0.3)
    const h2 = Math.round(mapH * 0.2)
    const h3 = Math.round(mapH * 0.1)
    g.rect(0, mapH - h1, mapW, h1).fill({ color: 0x080818, alpha: 0.06 })
    g.rect(0, mapH - h2, mapW, h2).fill({ color: 0x080818, alpha: 0.06 })
    g.rect(0, mapH - h3, mapW, h3).fill({ color: 0x080818, alpha: 0.06 })
    const tex = app.renderer.generateTexture(g)
    g.destroy()
    fgDecorLayer.addChild(new Sprite(tex))
}

function buildVignetteLayer(app: Application, screenW: number, screenH: number): void {
    const g = new Graphics()

    for (let i = 0; i < 3; i++) {
        const inset = i * 20
        const a = 0.08 - i * 0.02
        g.rect(0, inset, 60 - inset, screenH - inset * 2).fill({ color: 0x000008, alpha: a })
        g.rect(screenW - 60 + inset, inset, 60 - inset, screenH - inset * 2).fill({ color: 0x000008, alpha: a })
        g.rect(inset, 0, screenW - inset * 2, 60 - inset).fill({ color: 0x000008, alpha: a })
        g.rect(inset, screenH - 60 + inset, screenW - inset * 2, 60 - inset).fill({ color: 0x000008, alpha: a })
    }

    const tex = app.renderer.generateTexture(g)
    g.destroy()
    hudLayer.addChild(new Sprite(tex))
}

function generateDotTexture(app: Application): Texture {
    const g = new Graphics()
    g.circle(2, 2, 2).fill({ color: 0xffffff })
    const tex = app.renderer.generateTexture(g)
    g.destroy()
    return tex
}

function lcg(s: number): number {
    return (s * 1664525 + 1013904223) & 0x7fffffff
}

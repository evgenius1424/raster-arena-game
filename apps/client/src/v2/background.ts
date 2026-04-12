import { Application, FillGradient, Graphics, Sprite } from 'pixi.js'
import { bgLayer } from './app'

const SCALE = 2
const STAR_COUNT = 350

export function initBackground(
    app: Application,
    screenW: number,
    screenH: number,
    _mapW: number,
    _mapH: number,
): void {
    buildGradientLayer(app, screenW, screenH)
    buildStarfieldLayer(app, screenW, screenH)
}

export function updateBackground(_cameraX: number, _cameraY: number, _tick: number): void {}

function buildGradientLayer(app: Application, screenW: number, screenH: number): void {
    const w = screenW * SCALE
    const h = screenH * SCALE

    const gradient = new FillGradient(0, 0, 0, h)
    gradient.addColorStop(0, 0x020208)
    gradient.addColorStop(0.4, 0x05050f)
    gradient.addColorStop(1, 0x0a0a1a)

    const g = new Graphics()
    g.rect(0, 0, w, h).fill(gradient)

    const tex = app.renderer.generateTexture(g)
    tex.source.scaleMode = 'linear'
    g.destroy()

    const sprite = new Sprite(tex)
    sprite.width = screenW
    sprite.height = screenH
    bgLayer.addChild(sprite)
}

function buildStarfieldLayer(app: Application, screenW: number, screenH: number): void {
    const w = screenW * SCALE
    const h = screenH * SCALE
    const g = new Graphics()

    for (let i = 0; i < STAR_COUNT; i++) {
        const x = pseudoRandom(i, 1531, 173) % w
        const y = pseudoRandom(i, 947, 311) % h
        const cls = (i * 31) % 25

        if (cls <= 15) {
            const a = 0.15 + vary(i) * 0.2
            g.circle(x, y, 0.5 * SCALE).fill({ color: 0x8888aa, alpha: a })
        } else if (cls <= 21) {
            const a = 0.25 + vary(i) * 0.3
            const tint = i % 3 === 0 ? 0xaaccee : i % 3 === 1 ? 0xccbbdd : 0xccccee
            g.circle(x, y, 1.0 * SCALE).fill({ color: tint, alpha: a })
        } else {
            const a = 0.5 + vary(i) * 0.4
            g.circle(x, y, 1.5 * SCALE).fill({ color: 0xeeeeff, alpha: a })
            g.circle(x, y, 3.0 * SCALE).fill({ color: 0xccccff, alpha: a * 0.15 })
        }
    }

    const tex = app.renderer.generateTexture(g)
    tex.source.scaleMode = 'linear'
    g.destroy()

    const sprite = new Sprite(tex)
    sprite.width = screenW
    sprite.height = screenH
    bgLayer.addChild(sprite)
}

function pseudoRandom(i: number, mul: number, offset: number): number {
    return ((i * mul + offset) * 16807) % 2147483647
}

function vary(i: number): number {
    return ((i * 271) % 100) / 100
}

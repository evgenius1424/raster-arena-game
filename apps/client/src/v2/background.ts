import { Application, FillGradient, Graphics, Sprite } from 'pixi.js'
import { bgLayer } from './app'

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

export function updateBackground(_cameraX: number, _cameraY: number, _tick: number): void {
}

function buildGradientLayer(app: Application, screenW: number, screenH: number): void {
    const gradient = new FillGradient(0, 0, 0, screenH)
    gradient.addColorStop(0, 0x03030a)
    gradient.addColorStop(0.35, 0x06060f)
    gradient.addColorStop(0.65, 0x0a0a18)
    gradient.addColorStop(1, 0x0e0e22)
    const g = new Graphics()
    g.rect(0, 0, screenW, screenH).fill(gradient)
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

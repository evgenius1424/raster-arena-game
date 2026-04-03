import * as PIXI from 'pixi.js'
import { Assets } from 'pixi.js'

export const app = await initApp()
export const { renderer, stage } = app

export const world = new PIXI.Container()
stage.addChild(world)
stage.visible = false

export const tiles = new PIXI.Container()
export const smokeLayer = new PIXI.Container()
export const items = new PIXI.Container()
export const projectiles = new PIXI.Container()
export const explosionsLayer = new PIXI.Container()
export const aimLine = new PIXI.Graphics()
export const railLines = new PIXI.Graphics()
export const shaftLines = new PIXI.Graphics()
export const bulletImpacts = new PIXI.Graphics()
export const gauntletSparks = new PIXI.Graphics()

world.addChild(tiles)
world.addChild(smokeLayer)
world.addChild(projectiles)
world.addChild(items)
world.addChild(explosionsLayer)
world.addChild(aimLine)
world.addChild(railLines)
world.addChild(shaftLines)
world.addChild(bulletImpacts)
world.addChild(gauntletSparks)

async function initApp() {
    await Assets.init()

    const app = new PIXI.Application()

    const initPromise = app.init({
        width: innerWidth,
        height: innerHeight,
        background: 0x262626,
        autoDensity: true,
        resolution: Math.min(devicePixelRatio || 1, 2),
        preference: 'webgl',
    })

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pixi init timeout after 8s')), 8000),
    )

    await Promise.race([initPromise, timeout])

    app.canvas.style.display = 'block'
    document.getElementById('game')?.appendChild(app.canvas)

    return app
}

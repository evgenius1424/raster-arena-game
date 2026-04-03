import * as PIXI from 'pixi.js'
import { Console } from '../core/helpers'

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
    console.log('[PIXI] step 1: creating Application')
    const app = new PIXI.Application()
    try {
        console.log('[PIXI] step 2: calling app.init', { innerWidth, innerHeight, dpr: devicePixelRatio })
        await app.init({
            width: innerWidth,
            height: innerHeight,
            background: 0x262626,
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
            preference: 'webgl',
        })
        console.log('[PIXI] step 3: app.init done, renderer type:', app.renderer?.type, 'canvas:', app.canvas?.width, 'x', app.canvas?.height)
    } catch (err) {
        console.error('[PIXI] app.init FAILED:', err)
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        throw err
    }
    app.canvas.style.display = 'block'
    document.getElementById('game').appendChild(app.canvas)
    console.log('[PIXI] step 4: canvas attached to DOM')
    app.ticker.add(() => {
        if (!app.ticker._pixi_logged) {
            console.log('[PIXI] step 5: first ticker tick - renderer is running')
            app.ticker._pixi_logged = true
        }
    })
    return app
}

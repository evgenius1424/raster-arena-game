import * as PIXI from 'pixi.js'
import { Assets } from 'pixi.js'
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
    // Disable WebGPU detection — navigator.gpu.requestAdapter() hangs indefinitely
    // on HTTPS in Chrome/Firefox with no timeout. Patch the prototype so it affects
    // all code paths including pixi internals.
    try {
        Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })
    } catch {}

    console.log('[PIXI] gpu disabled:', !navigator.gpu)

    // Skip compressed-texture format detections (they call isWebGPUSupported internally)
    await Assets.init({ skipDetections: true })
    console.log('[PIXI] Assets.init done')

    const app = new PIXI.Application()

    console.log('[PIXI] calling app.init')

    const initPromise = app.init({
        width: innerWidth,
        height: innerHeight,
        background: 0x262626,
        autoDensity: true,
        resolution: Math.min(devicePixelRatio || 1, 2),
        preference: 'webgl',
        skipExtensionImports: true,
    })

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Pixi init timeout after 8s')), 8000)
    )

    try {
        await Promise.race([initPromise, timeout])
        console.log('[PIXI] app.init done, renderer:', app.renderer?.type)
    } catch (err) {
        console.error('[PIXI] app.init FAILED or timed out:', err.message)
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        throw err
    }

    app.canvas.style.display = 'block'
    document.getElementById('game')?.appendChild(app.canvas)

    return app
}

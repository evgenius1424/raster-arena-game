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
    // Pixi v8 bug: even when preference:'webgl', Pixi internally calls isWebGPUSupported()
    // -> navigator.gpu.requestAdapter() which hangs indefinitely on HTTPS (no timeout).
    // On HTTP, navigator.gpu is undefined (secure context required), so it's skipped.
    // Fix: patch Navigator.prototype so navigator.gpu returns undefined before Pixi init.
    try {
        Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })
    } catch {}

    console.log('[PIXI] gpu disabled:', !navigator.gpu)
    console.log('[PIXI] calling app.init')

    const app = new PIXI.Application()
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
        setTimeout(() => reject(new Error('Pixi init timeout after 5s')), 5000)
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
    document.getElementById('game').appendChild(app.canvas)
    return app
}

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
    // Diagnostic: check if WebGL stencil passes (same test Pixi's nf() runs internally)
    const testCanvas = document.createElement('canvas')
    const testCtx = testCanvas.getContext('webgl', { stencil: true })
    const stencilOk = !!testCtx?.getContextAttributes()?.stencil
    console.log('[PIXI] WebGL stencil check:', stencilOk, testCtx ? 'ctx ok' : 'no ctx')
    if (testCtx) testCtx.getExtension('WEBGL_lose_context')?.loseContext()

    // If stencil fails, Pixi's WebGL detection returns false and falls through to WebGPU.
    // navigator.gpu.requestAdapter() hangs on HTTPS with no timeout — disable it.
    if (!stencilOk && navigator.gpu) {
        console.log('[PIXI] disabling WebGPU to prevent requestAdapter() hang')
        try { Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }) } catch {}
    }

    console.log('[PIXI] step 1: pre-init Assets (skip detections)')
    await Assets.init({ skipDetections: true })
    console.log('[PIXI] step 2: creating Application')
    const app = new PIXI.Application()
    try {
        console.log('[PIXI] step 3: calling app.init', { innerWidth, innerHeight, dpr: devicePixelRatio })
        await app.init({
            width: innerWidth,
            height: innerHeight,
            background: 0x262626,
            autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2),
            preference: 'webgl',
        })
        console.log('[PIXI] step 4: app.init done, renderer type:', app.renderer?.type)
    } catch (err) {
        console.error('[PIXI] app.init FAILED:', err)
        Console.writeText(`renderer init failed: ${err?.message ?? err}`)
        throw err
    }
    app.canvas.style.display = 'block'
    document.getElementById('game').appendChild(app.canvas)
    console.log('[PIXI] step 5: canvas attached to DOM')
    return app
}

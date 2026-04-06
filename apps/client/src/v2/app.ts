import { Application, Container, Graphics } from 'pixi.js'
import { BG_COLOR } from './constants'

const app = new Application()

await app.init({
    background: BG_COLOR,
    resizeTo: document.getElementById('game')!,
    autoDensity: true,
    resolution: Math.min(devicePixelRatio || 1, 2),
    antialias: false,
    preference: 'webgl',
})

app.canvas.style.display = 'block'
document.getElementById('game')!.appendChild(app.canvas)

// --- Stage-level layers ---
app.stage.sortableChildren = true

export const bgLayer = new Container()
bgLayer.zIndex = 0

export const world = new Container()
world.zIndex = 1
world.sortableChildren = true

export const hudLayer = new Container()
hudLayer.zIndex = 100

app.stage.addChild(bgLayer, world, hudLayer)

// --- World child layers ---
export const bgDecorLayer = new Container()
bgDecorLayer.zIndex = 10

export const tilesLayer = new Container()
tilesLayer.zIndex = 20

export const itemsLayer = new Container()
itemsLayer.zIndex = 30

export const smokeLayer = new Container()
smokeLayer.zIndex = 40

export const projectilesLayer = new Container()
projectilesLayer.zIndex = 50

export const entitiesLayer = new Container()
entitiesLayer.zIndex = 60

export const fxLayer = new Container()
fxLayer.zIndex = 70

export const beamLayer = new Graphics()
beamLayer.zIndex = 75

export const fgDecorLayer = new Container()
fgDecorLayer.zIndex = 80

world.addChild(
    bgDecorLayer,
    tilesLayer,
    itemsLayer,
    smokeLayer,
    projectilesLayer,
    entitiesLayer,
    fxLayer,
    beamLayer,
    fgDecorLayer,
)

export { app }

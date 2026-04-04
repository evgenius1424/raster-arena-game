import { Application, Container, Graphics, Rectangle } from 'pixi.js'
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

app.stage.sortableChildren = true

export const bgLayer = new Container()
bgLayer.zIndex = 0

export const world = new Container()
world.zIndex = 1
world.sortableChildren = true
world.cullable = true

export const hudLayer = new Container()
hudLayer.zIndex = 100

app.stage.addChild(bgLayer, world, hudLayer)

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
entitiesLayer.cullable = true

export const fxLayer = new Container()
fxLayer.zIndex = 70

export const beamLayer = new Graphics()
beamLayer.zIndex = 75

export const fgDecorLayer = new Container()
fgDecorLayer.zIndex = 80

export const debugLayer = new Container()
debugLayer.zIndex = 90

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
    debugLayer,
)

export function setCullArea(w: number, h: number): void {
    world.cullArea = new Rectangle(0, 0, w, h)
}

export { app }

import { Application, Container, Graphics, Rectangle } from 'pixi.js'
import { BG_COLOR } from './constants'

// Logical height: This is the "resolution" your game logic sees.
// 540 or 720 is great for a "modern high-scale" feel with 32x16 bricks.
const LOGICAL_HEIGHT = 540

const app = new Application()

await app.init({
    background: BG_COLOR,
    resizeTo: document.getElementById('game')!,
    autoDensity: true,
    // Setting this to 2 (or devicePixelRatio) makes lines and glows razor sharp
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    antialias: true, // Set to true for modern, smooth neon glows
    preference: 'webgl',
})

app.canvas.style.display = 'block'
document.getElementById('game')!.appendChild(app.canvas)

app.stage.sortableChildren = true

// --- Keep your existing API exactly as is ---
export const bgLayer = new Container()
bgLayer.zIndex = 0

export const world = new Container()
world.zIndex = 1
world.sortableChildren = true
// world.cullable = true // We handle culling via the custom function below

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

/**
 * UPDATED: The Scale Logic
 * This keeps your 32x16 bricks looking modern by scaling the world
 * container to fit the screen height perfectly.
 */
function updateLayout() {
    const screenW = app.screen.width
    const screenH = app.screen.height

    // Calculate how much to zoom the world so the height is always LOGICAL_HEIGHT
    const scale = screenH / LOGICAL_HEIGHT
    world.scale.set(scale)

    // Optional: Center the world if the screen is wider than your intended level
    // world.x = (screenW - (levelWidthInPixels * scale)) / 2;

    // Update the culling area based on the new scale
    setCullArea(screenW / scale, screenH / scale)
}

// Keep your API function the same, but it now accounts for scale
export function setCullArea(w: number, h: number): void {
    // We add a small buffer (100px) so objects don't pop in/out visibly
    world.cullArea = new Rectangle(-100, -100, w + 200, h + 200)
}

// Listen for window resizing to maintain the "Sleek" scale
window.addEventListener('resize', updateLayout)
updateLayout() // Initial call

export { app }

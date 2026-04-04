import { Container } from 'pixi.js'
import { TILE_W } from './constants'

const TILES_VISIBLE_X = 28

export class Camera {
    x = 0
    y = 0
    zoom = 1
    trauma = 0

    update(
        targetX: number,
        targetY: number,
        screenW: number,
        screenH: number,
        mapPixelW: number,
        mapPixelH: number,
        cols: number,
    ): void {
        const baseZoom = screenW / (TILES_VISIBLE_X * TILE_W)

        if (cols <= TILES_VISIBLE_X) {
            const zoom = Math.min(screenW / mapPixelW, screenH / mapPixelH, baseZoom)
            this.zoom = zoom
            this.x = (screenW - mapPixelW * zoom) / 2
            this.y = (screenH - mapPixelH * zoom) / 2
        } else {
            const sw = mapPixelW * baseZoom
            const sh = mapPixelH * baseZoom
            this.zoom = baseZoom
            this.x = Math.min(0, Math.max(screenW - sw, screenW / 2 - targetX * baseZoom))
            this.y = sh > screenH
                ? Math.min(0, Math.max(screenH - sh, screenH / 2 - targetY * baseZoom))
                : (screenH - sh) / 2
        }
    }

    apply(world: Container): void {
        world.scale.set(this.zoom)
        world.x = this.x
        world.y = this.y
    }
}

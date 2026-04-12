import { Container } from 'pixi.js'

const MAX_ZOOM = 1.6

export class Camera {
    x = 0
    y = 0
    zoom = 1
    private floating = false
    private halfW = 0
    private halfH = 0

    update(
        targetX: number,
        targetY: number,
        screenW: number,
        screenH: number,
        mapPixelW: number,
        mapPixelH: number,
        _cols: number,
    ): void {
        const fitZoom = Math.min(screenW / mapPixelW, screenH / mapPixelH, MAX_ZOOM)
        const scaledW = mapPixelW * fitZoom
        const scaledH = mapPixelH * fitZoom

        this.floating = scaledW > screenW || scaledH > screenH

        if (this.floating) {
            this.zoom = fitZoom
            this.halfW = (screenW / 2) | 0
            this.halfH = (screenH / 2) | 0
            this.x = clamp(this.halfW - targetX * this.zoom, screenW - scaledW, 0)
            this.y = clamp(this.halfH - targetY * this.zoom, screenH - scaledH, 0)
        } else {
            this.zoom = fitZoom
            this.x = ((screenW - scaledW) / 2) | 0
            this.y = ((screenH - scaledH) / 2) | 0
        }
    }

    apply(world: Container): void {
        world.scale.set(this.zoom)
        world.x = this.x
        world.y = this.y
    }
}

function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v
}

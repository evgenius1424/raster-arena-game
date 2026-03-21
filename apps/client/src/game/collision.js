import { getWasmModuleSync } from '../wasm/client'

const scratchBox = new Float32Array(4)

export function getPlayerHitbox(player, padding = 0) {
    const wasm = getWasmModuleSync()
    wasm.wasm_player_hitbox(player.x, player.y, player.crouch ?? false, padding, scratchBox)
    return {
        minX: scratchBox[0],
        maxX: scratchBox[1],
        minY: scratchBox[2],
        maxY: scratchBox[3],
    }
}

export function segmentAabbT(x0, y0, x1, y1, box) {
    const wasm = getWasmModuleSync()
    const t = wasm.wasm_segment_aabb_t(x0, y0, x1, y1, box.minX, box.maxX, box.minY, box.maxY)
    return t < 0 ? null : t
}

import { initWasm } from '../wasm/client'

window.addEventListener('error', (e) => console.error('[BOOT] window error:', e.message, e.filename, e.lineno))
window.addEventListener('unhandledrejection', (e) => console.error('[BOOT] unhandled rejection:', e.reason))

console.log('[BOOT] step 1: starting wasm init')
try {
    await initWasm()
    console.log('[BOOT] step 2: wasm ok')
} catch (e) {
    console.error('[BOOT] WASM FAILED:', e)
    throw e
}

console.log('[BOOT] step 3: importing main')
await import('./main')
console.log('[BOOT] step 4: main imported')

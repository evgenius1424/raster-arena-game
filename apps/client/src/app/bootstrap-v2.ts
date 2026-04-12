import { initWasm } from '#/wasm/client'

await initWasm()
await import('../v2/app')
await import('../v2/main')

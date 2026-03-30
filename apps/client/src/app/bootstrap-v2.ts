import { initWasm } from '#/wasm/client'

await initWasm()
await import('../v2/app')

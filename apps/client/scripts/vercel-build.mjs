/**
 * Post-build script: converts TanStack Start build output into Vercel Build Output API v3 format.
 *
 * Input:
 *   dist/client/   → static assets (JS, CSS, maps, sounds)
 *   dist/server/   → SSR server bundle (server.js + assets/)
 *
 * Output:
 *   <repo-root>/.vercel/output/
 *     static/            ← served directly by Vercel CDN
 *     functions/
 *       __fallback.func/ ← handles all other requests (SSR + API)
 *     config.json        ← routing: static first, then fallback function
 */

import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientRoot = resolve(__dirname, '..')
const repoRoot = resolve(clientRoot, '../..')
const vercelOut = resolve(repoRoot, '.vercel', 'output')
const funcDir = resolve(vercelOut, 'functions/__fallback.func')

// Clean old output
rmSync(vercelOut, { recursive: true, force: true })
mkdirSync(funcDir, { recursive: true })

// 1. Copy static client assets → .vercel/output/static/
cpSync(resolve(clientRoot, 'dist/client'), resolve(vercelOut, 'static'), {
    recursive: true,
})

// 2. Write a thin Node.js handler that bridges the TanStack Start fetch handler
//    to Vercel's (req: IncomingMessage, res: ServerResponse) interface.
const entryPath = resolve(clientRoot, 'dist/server/_vercel-entry.mjs')
writeFileSync(
    entryPath,
    `
import server from './server.js';

export default async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = new URL(req.url, proto + '://' + host);

    // Read request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length > 0 ? Buffer.concat(chunks) : null;

    // Sanitise headers for the Web Request constructor
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v != null) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      ...(body && body.length > 0 ? { body, duplex: 'half' } : {}),
    });

    const response = await server.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));

    // Stream the response (supports SSE)
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(value)) await new Promise(r => res.once('drain', r));
          if (typeof res.flush === 'function') res.flush();
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) {
    console.error('Vercel handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}
`,
)

// 3. Bundle with esbuild: bundles all npm deps, code-splits dynamic imports,
//    keeps Node built-ins (node:*) external.
const esbuild = resolve(repoRoot, 'node_modules/.bin/esbuild')
execSync(
    [
        esbuild,
        entryPath,
        '--bundle',
        '--platform=node',
        '--target=node20',
        '--format=esm',
        '--splitting',
        '--external:node:*',
        // CJS packages (e.g. react-dom/server.node.js) use require() at runtime;
        // this shim makes require() work inside an ESM bundle.
        `--banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
        '--entry-names=index',
        '--chunk-names=chunks/[name]-[hash]',
        `--outdir=${funcDir}`,
    ].join(' '),
    { stdio: 'inherit', cwd: repoRoot },
)

// 4. Vercel function config
writeFileSync(
    resolve(funcDir, '.vc-config.json'),
    JSON.stringify({
        runtime: 'nodejs20.x',
        handler: 'index.js',
        launchAt: 'request',
    }),
)

// 5. Routing: serve static assets first, fall through to the SSR function
writeFileSync(
    resolve(vercelOut, 'config.json'),
    JSON.stringify({
        version: 3,
        routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/__fallback' }],
    }),
)

console.log('Vercel build output ready at .vercel/output/')

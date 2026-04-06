import { defineConfig } from 'vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    build: {
        cssCodeSplit: false,
    },
    plugins: [
        tsconfigPaths({ projects: ['./tsconfig.json'] }),
        tailwindcss(),
        TanStackRouterVite({ routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
        viteReact(),
    ],
    publicDir: 'public',
    server: {
        // Proxy /api/* to the Express server in development.
        // In production, set VITE_API_URL to point at the VPS.
        proxy: {
            '/api': {
                target: `http://localhost:${process.env['API_PORT'] ?? 3002}`,
                changeOrigin: true,
            },
        },
    },
})

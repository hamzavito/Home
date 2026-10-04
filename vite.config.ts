import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} (${commit})`),
  },
  build: {
    rolldownOptions: {
      output: {
        // Separate vendor-chunks: de ændrer sig sjældent og kan caches på tværs af deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'Hjem',
        short_name: 'Hjem',
        description: 'Vores fælles overblik over hjem, økonomi og hverdag',
        lang: 'da',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f3ef',
        theme_color: '#f4f3ef',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-skallen caches, så appen åbner hurtigt og uden hvid skærm.
        // Data fra Supabase caches IKKE af service workeren (det håndterer TanStack Query).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // OCR-filerne (flere MB) precaches ikke – de hentes første gang der scannes
        // og gemmes derefter lokalt (CacheFirst), så næste scanning er hurtig.
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})

// Build af appen med den lokale demo-backend (e2e/demo/backend.ts) i stedet for Supabase.
//   DEMO_TARGET=test     → normal URL-routing, base '/'   (E2E-tests)
//   DEMO_TARGET=artifact → intern router, relative stier   (klikbar demo)
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const target = process.env.DEMO_TARGET === 'artifact' ? 'artifact' : 'test'
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const PWA_STUB = `import { useState } from 'react'
// Demo: ingen service worker. localStorage 'hjem-demo-update' = '1' simulerer en ny version.
export function useRegisterSW() {
  const [need] = useState(() => { try { return localStorage.getItem('hjem-demo-update') === '1' } catch { return false } })
  return { needRefresh: [need, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => { localStorage.removeItem('hjem-demo-update'); location.reload() } }
}
`

const demoPatches = (): Plugin => ({
  name: 'demo-patches',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:pwa-register/react') return '\0pwa-stub'
    return null
  },
  load(id) {
    if (id === '\0pwa-stub') return PWA_STUB
    return null
  },
  transform(code, id) {
    if (id.endsWith('/src/lib/env.ts')) return "export const env = { supabaseUrl: 'http://demo.local', supabaseAnonKey: 'demo' }\nexport const isConfigured = true\n"
    if (target !== 'artifact') return null
    if (id.endsWith('/src/app/router.tsx'))
      return code
        .replace("import { createBrowserRouter } from 'react-router'", "import { createMemoryRouter } from 'react-router'")
        .replace('createBrowserRouter([', 'createMemoryRouter([')
        .replace(/\]\)\s*$/, "], { initialEntries: ['/'] })\n")
    if (id.endsWith('/src/features/auth/LoginPage.tsx')) return code.replace('"/icons/', '"./icons/')
    if (id.endsWith('/src/features/receipts/ocr.ts')) return code.replace("new URL('/ocr/', window.location.origin)", "new URL('./ocr/', window.location.href)")
    return null
  },
})

export default defineConfig({
  root: r('..'),
  base: target === 'artifact' ? './' : '/',
  publicDir: r('../public'),
  define: { __APP_VERSION__: JSON.stringify('demo') },
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: r('./demo/backend.ts') },
      { find: '@', replacement: r('../src') },
    ],
  },
  plugins: [demoPatches(), react(), tailwindcss()],
  build: { outDir: r(target === 'artifact' ? './.dist-artifact' : './.dist'), emptyOutDir: true },
  preview: { port: 4300, strictPort: true },
})

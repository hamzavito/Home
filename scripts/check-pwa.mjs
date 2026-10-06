// Tjekker det byggede PWA-output (kør efter `npm run build`).
// Fejler hvis noget, der er vigtigt for installation på iPhone eller for
// privatlivet (ingen data i service worker-cachen), er gået i stykker.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const fail = []
const ok = (cond, msg) => (cond ? console.log('✓', msg) : fail.push(msg))

const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'))
ok(manifest.display === 'standalone', 'manifest: standalone')
ok(manifest.lang === 'da', 'manifest: dansk')
ok(manifest.start_url === '/' && manifest.scope === '/', 'manifest: start_url og scope')
ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest: maskable ikon')
for (const i of manifest.icons) ok(existsSync(`dist${i.src}`), `ikon findes: ${i.src}`)

const html = readFileSync('dist/index.html', 'utf8')
ok(html.includes('apple-touch-icon'), 'index.html: apple-touch-icon')
ok(html.includes('viewport-fit=cover'), 'index.html: viewport-fit=cover (safe areas)')
ok(html.includes('apple-mobile-web-app-status-bar-style'), 'index.html: statuslinje')
const splash = [...html.matchAll(/apple-touch-startup-image"[^>]*href="([^"]+)"/g)].map((m) => m[1])
ok(splash.length >= 10, `index.html: ${splash.length} startskærme`)
for (const s of splash) if (!existsSync(`dist${s}`)) fail.push(`startskærm mangler: ${s}`)

const sw = readFileSync('dist/sw.js', 'utf8')
ok(!/supabase\.co/.test(sw), 'service worker: cacher ikke Supabase-data')
ok(!sw.includes('splash/') && !sw.includes('ocr/dan'), 'service worker: precacher ikke startskærme eller OCR-data')
ok(sw.includes('index.html'), 'service worker: app-skal precaches (offline-start)')
ok(sw.includes('importScripts("push-sw.js")') || sw.includes("importScripts('push-sw.js')"), 'service worker: indlæser notifikationer (push-sw.js)')
ok(existsSync('dist/push-sw.js') && readFileSync('dist/push-sw.js', 'utf8').includes('showNotification'), 'push-sw.js: viser notifikationer')

// Ingen hemmeligheder i det, der sendes til browseren
const bundle = readdirSync('dist/assets').filter((f) => f.endsWith('.js')).map((f) => readFileSync(`dist/assets/${f}`, 'utf8')).join('\n')
ok(!/service_role|SERVICE_ROLE_KEY|CLEANUP_SECRET|BACKUP_PASSPHRASE|SUPABASE_DB_URL/.test(bundle), 'bundle: ingen service role-nøgle eller andre hemmeligheder')

if (fail.length) {
  console.error('\n✗ PWA-tjek fejlede:\n  ' + fail.join('\n  '))
  process.exit(1)
}
console.log('✓ PWA-output er i orden')

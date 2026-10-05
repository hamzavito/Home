// Oprydning ved log ud. Appens egne caches indeholder kun app-skallen og
// OCR-filer (ingen private data), men alt andet fjernes for en sikkerheds skyld.
const KEEP_CACHES = [/^workbox-precache/, /^ocr-assets$/]

export function clearPrivateDeviceData() {
  try {
    // Fx nedtælling for nulstillingskode og en evt. kortvarig session ("Husk mig" fra)
    sessionStorage.clear()
  } catch {
    // ingen adgang til lagring
  }
  try {
    // Supabase-sessionen fjernes af signOut – her tages evt. rester med (fx ved netværksfejl)
    for (const k of Object.keys(localStorage)) if (k.startsWith('hjem.auth') || k.startsWith('sb-')) localStorage.removeItem(k)
  } catch {
    // ingen adgang til lagring
  }
  if (typeof caches !== 'undefined')
    void caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP_CACHES.some((r) => r.test(n))).map((n) => caches.delete(n))))
      .catch(() => {})
}

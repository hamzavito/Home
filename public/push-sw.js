// Notifikationer (Web Push). Indlæses i service workeren via workbox.importScripts.
// iPhone kræver, at hver push viser en notifikation – ellers stopper Apple dem.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  event.waitUntil(
    self.registration.showNotification(typeof data.title === 'string' && data.title ? data.title : 'Hjem', {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'da',
      data: { url },
    }),
  )
})

// Tryk på notifikationen: åbn appen på den rigtige side (genbrug et åbent vindue)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data && typeof event.notification.data.url === 'string' ? event.notification.data.url : '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if (client.url !== target && 'navigate' in client) await client.navigate(target).catch(() => {})
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

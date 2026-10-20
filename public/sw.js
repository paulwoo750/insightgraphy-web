// InsightGraphy 학회원 앱 서비스 워커: 푸시 알림만 다룬다.
// 페이지를 캐시하지 않으므로 배포하면 바로 새 화면이 보인다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'InsightGraphy', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'InsightGraphy'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/app-icons/icon-192.png',
    badge: '/app-icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/app' },
  }))
})

// 알림을 누르면 열려 있는 앱 창으로 가고, 없으면 새로 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/app', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus()
        if ('navigate' in client) return client.navigate(target)
        return undefined
      }
    }
    return self.clients.openWindow(target)
  })())
})

/* Service worker для push-уведомлений вкладки «Общение». Ничего не кеширует — только показывает
   уведомления, пришедшие с моста (см. bridge/app/push.py и chat.js). */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || 'МПБ';
  var url = data.url || './index.html#/chat';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icon-512.png',
    badge: 'icon-180.png',
    tag: 'mpb-chat',
    renotify: true,
    data: { url: url }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if ('focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

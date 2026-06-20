// ノマドトラッカー Service Worker
const CACHE_NAME = 'nomad-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── 通知スケジューリング ──────────────────────────
let scheduledTimers = [];

function clearAllTimers() {
  scheduledTimers.forEach(id => clearTimeout(id));
  scheduledTimers = [];
}

function scheduleNotification(hour, minute, label) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // 今日の時間を過ぎていたら明日

  const delay = next - now;

  const id = setTimeout(async () => {
    await self.registration.showNotification('ノマドトラッカー 📋', {
      body: label,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `reminder-${hour}-${minute}`,
      renotify: true,
      requireInteraction: false,
      data: { url: '/' }
    });
    // 翌日も同じ時間に再スケジュール
    scheduleNotification(hour, minute, label);
  }, delay);

  scheduledTimers.push(id);
}

// メインスレッドからの設定受信
self.addEventListener('message', e => {
  if (e.data.type === 'SCHEDULE_NOTIFICATIONS') {
    clearAllTimers();
    const { reminders } = e.data; // [{ hour, minute, label }]
    reminders.forEach(r => scheduleNotification(r.hour, r.minute, r.label));
  }
  if (e.data.type === 'CLEAR_NOTIFICATIONS') {
    clearAllTimers();
  }
});

// 通知タップ → アプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});

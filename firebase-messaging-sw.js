importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCTNxprto8tS76qr9opP1CCPaDD8dNZNRI",
  authDomain: "game-chat-hub.firebaseapp.com",
  projectId: "game-chat-hub",
  storageBucket: "game-chat-hub.firebasestorage.app",
  messagingSenderId: "87164754087",
  appId: "1:87164754087:web:2fa11234447e6129b06382"
});

const messaging = firebase.messaging();

// Shows the notification when Jolt is closed
messaging.onBackgroundMessage(function (payload) {
  var d = payload.data || {};
  var title = d.title || "Jolt";
  self.registration.showNotification(title, {
    body: d.body || "You have news on Jolt",
    icon: "icon-192-1-2.png",
    badge: "icon-192-1-2.png",
    vibrate: [200, 100, 200],
    data: { url: d.url || "./" }
  });
});

// Tapping the notification opens Jolt
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      return clients.openWindow(url);
    })
  );
});

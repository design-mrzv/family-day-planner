// Service worker для web push (Етап 4). Без бібліотек — двом обробникам вони не потрібні.

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Family Day Planner", {
      body: data.body || "",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

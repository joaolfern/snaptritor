/**
 * The client's service worker (RF08, RF09, NF08). Two jobs: turn a push payload into a
 * notification that shows the shop screenshot inline (no tap required — NF08/Q09's resolution:
 * the push payload carries only a URL, and the Notification API's own `image` option fetches and
 * renders it), and open/focus the app when the player taps it.
 */

export interface PushPayload {
  imageUrl: string;
}

export interface NotificationOptionsLike {
  body?: string;
  image?: string;
}

/**
 * Pure: builds the `showNotification` options from a decoded push payload. No text field claims
 * to name cards or costs — nothing in this pipeline decodes what the screenshot shows
 * (constitution Article 2); the image itself is the whole message. Kept free of any
 * `ServiceWorkerGlobalScope` dependency so it's testable as plain data in plain Node, without a
 * browser or a fake `self`.
 */
export function buildNotificationOptions(payload: PushPayload): NotificationOptionsLike {
  return {
    body: "The card shop changed",
    image: payload.imageUrl,
  };
}

const NOTIFICATION_TITLE = "Snaptritor";

// The actual service-worker wiring. Guarded so importing this module's pure function above (as
// sw.test.ts does) never tries to register real listeners against a `self` that doesn't exist in
// plain Node — only a real browser/service-worker runtime has one.
declare const self: ServiceWorkerGlobalScope;

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("push", (event: PushEvent) => {
    const payload = event.data?.json() as PushPayload | undefined;
    if (!payload?.imageUrl) return;

    const options = buildNotificationOptions(payload);
    event.waitUntil(self.registration.showNotification(NOTIFICATION_TITLE, options));
  });

  self.addEventListener("notificationclick", (event: NotificationEvent) => {
    event.notification.close();
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = windows.find((client) => "focus" in client);
        if (existing) {
          await (existing as WindowClient).focus();
        } else {
          await self.clients.openWindow("/");
        }
      })(),
    );
  });
}

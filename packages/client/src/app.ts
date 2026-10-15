/**
 * The client app shell: subscribe flow (RF08), the main offer view (RF09), and the pairing UI
 * (RF16, RF17 — scenario 8). Same-origin fetches throughout: this file and the Worker's API both
 * live under the user's own domain (plan.md), so no CORS and no separate base-URL config.
 */

// .js, not .ts: this file is actually emitted to a real dist/app.js for a browser to load (unlike
// the Node-only packages elsewhere in this repo, which never emit and can import .ts directly) —
// tsc passes import specifiers through unchanged, so the specifier must match the emitted sibling.
import { DOWNLOAD_INSTALLER_URL, pairingStatusUrl, urlBase64ToUint8Array } from "./pure.js";

// --- DOM wiring --------------------------------------------------------------------------------

const els = {
  subscribeButton: document.getElementById("subscribe") as HTMLButtonElement,
  statusText: document.getElementById("status-text") as HTMLElement,
  pairingCode: document.getElementById("pairing-code") as HTMLElement,
  downloadLink: document.getElementById("download-link") as HTMLAnchorElement,
  pairingSection: document.getElementById("pairing-section") as HTMLElement,
  latestImage: document.getElementById("latest-image") as HTMLImageElement,
};

const LINK_STATUS_THROTTLE_MS = 20_000;
let lastLinkStatusCheckAt = 0;
let stopWatchingLinkStatus: (() => void) | undefined;

async function subscribe(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const vapidPublicKey = await (await fetch("/vapid-public-key")).text();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    // lib.dom.d.ts types Uint8Array generically over its buffer (could theoretically be a
    // SharedArrayBuffer); a freshly-constructed one from pure.ts never is one. Cast, don't lie.
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await fetch("/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      createdAt: new Date().toISOString(),
    }),
  });
}

async function requestPairingCode(endpoint: string): Promise<{ code: string }> {
  const response = await fetch("/pairing/code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriptionEndpoint: endpoint }),
  });
  return response.json();
}

/**
 * Replaces a blind `setInterval` (burned battery/requests on a backgrounded tab for no reason —
 * the player isn't watching it anyway) with an event-driven check: refetch when the tab actually
 * regains attention, throttled so switching tabs back and forth rapidly can't hammer the Worker.
 */
function watchLinkStatus(endpoint: string): void {
  if (stopWatchingLinkStatus) stopWatchingLinkStatus();

  const check = async (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastLinkStatusCheckAt < LINK_STATUS_THROTTLE_MS) return;
    lastLinkStatusCheckAt = now;

    const response = await fetch(pairingStatusUrl(endpoint));
    const { linked } = (await response.json()) as { linked: boolean };
    if (linked) {
      els.statusText.textContent = "Desktop linked";
      els.pairingSection.classList.add("linked");
      stopWatchingLinkStatus?.();
    }
  };

  const onFocusOrVisible = () => {
    if (document.visibilityState === "visible") check(false);
  };
  document.addEventListener("visibilitychange", onFocusOrVisible);
  window.addEventListener("focus", onFocusOrVisible);
  stopWatchingLinkStatus = () => {
    document.removeEventListener("visibilitychange", onFocusOrVisible);
    window.removeEventListener("focus", onFocusOrVisible);
    stopWatchingLinkStatus = undefined;
  };

  check(true); // check immediately too, not just on the next focus/visibility event
}

async function showPairingView(endpoint: string): Promise<void> {
  els.statusText.textContent = "Not linked yet";

  const alreadyLinked = await fetch(pairingStatusUrl(endpoint)).then((r) => r.json() as Promise<{ linked: boolean }>);
  if (alreadyLinked.linked) {
    els.statusText.textContent = "Desktop linked";
    els.pairingSection.classList.add("linked");
    els.pairingCode.textContent = "";
    return;
  }

  const { code } = await requestPairingCode(endpoint);
  els.pairingCode.textContent = code;
  watchLinkStatus(endpoint);
}

async function showLatestOffer(): Promise<void> {
  const response = await fetch("/inspections/latest");
  if (!response.ok) return; // nothing collected yet — leave the placeholder
  const { imageUrl } = (await response.json()) as { imageUrl: string };
  els.latestImage.src = imageUrl;
}

async function onSubscribeClick(): Promise<void> {
  els.subscribeButton.disabled = true;
  try {
    const subscription = await subscribe();
    await registerSubscription(subscription);
    await showPairingView(subscription.endpoint);
  } catch (err) {
    els.statusText.textContent = err instanceof Error ? err.message : "Could not subscribe";
    els.subscribeButton.disabled = false;
  }
}

async function init(): Promise<void> {
  // RF17: "a download link... is present and works, with no separate site or account needed" —
  // the installer download has no actual dependency on push support or a subscription existing,
  // so it must not be gated behind either. Confirmed live (real user report): this used to be set
  // only inside showPairingView(), which never runs before a successful subscribe — until then
  // the link kept its HTML default href="#", so clicking it silently did nothing.
  els.downloadLink.href = DOWNLOAD_INSTALLER_URL;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    els.statusText.textContent = "Push notifications aren't supported in this browser";
    els.subscribeButton.disabled = true;
    return;
  }

  // { type: "module" }: sw.ts exports `buildNotificationOptions` so sw.test.ts can test it as
  // plain data (no fake `self` needed) — but that `export` keyword is a syntax error if the
  // browser loads this script as a classic (non-module) script, which registration defaults to.
  // Confirmed live: registering without this option failed with "Uncaught SyntaxError:
  // Unexpected token 'export'" and the registration promise rejected with "script evaluation
  // failed", silently breaking RF08 end to end.
  await navigator.serviceWorker.register("/sw.js", { type: "module" });

  // Scenario 5/8: a returning visitor with an existing subscription skips straight to the
  // pairing/status view — no need to click "subscribe" again.
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    els.subscribeButton.style.display = "none";
    await showPairingView(existing.endpoint);
  } else {
    els.subscribeButton.addEventListener("click", onSubscribeClick);
  }

  await showLatestOffer();
}

init();

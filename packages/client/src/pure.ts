/**
 * Pure helpers with no DOM dependency, kept separate from `app.ts` (which touches `document` at
 * module scope) specifically so they're importable and testable from plain Node — the same reason
 * `sw.ts`'s event-listener wiring is guarded rather than inline.
 */

export function pairingStatusUrl(subscriptionEndpoint: string): string {
  return `/collector/status?endpoint=${encodeURIComponent(subscriptionEndpoint)}`;
}

export const DOWNLOAD_INSTALLER_URL = "/download/collector";

/** Converts a VAPID public key (base64url, as the Worker serves it) to the raw bytes `pushManager.subscribe` needs. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

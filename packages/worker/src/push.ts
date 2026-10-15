import type { PushSubscriptionRecord } from "@snaptritor/shared";
import type { Env } from "./env.js";
import { deleteSubscription, listSubscriptions } from "./subscriptions.js";

/**
 * VAPID (RFC 8292) signing and Web Push payload encryption (RFC 8291's `aes128gcm`), using only
 * the Workers runtime's own `SubtleCrypto` — this is plan.md's Q04 resolution: no extra push
 * service or library, the same `crypto.subtle` a browser has covers every primitive this needs.
 *
 * Caveat, stated plainly: this is a from-scratch implementation of a byte-exact wire format.
 * The tests below check its structure (JWT shape, header layout, round-trip through our own
 * import/export) but cannot prove interop with a real push service — only a real device actually
 * receiving a push does that (task T016/T017).
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// @cloudflare/workers-types declares exportKey() with a single signature returning
// `ArrayBuffer | JsonWebKey` regardless of format, rather than DOM lib's format-keyed
// overloads — a cast is needed every time we export "raw" or "pkcs8".
async function exportKeyBytes(format: "raw" | "pkcs8", key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array((await crypto.subtle.exportKey(format, key)) as ArrayBuffer);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface VapidKeys {
  /** 65-byte uncompressed P-256 point (0x04 || x || y). */
  publicKeyRaw: Uint8Array;
  /** ECDSA P-256 private key, usable only to sign. */
  privateKey: CryptoKey;
}

/** Imports a VAPID keypair from the base64url strings `wrangler secret` / env vars hold. */
export async function importVapidKeys(
  publicKeyBase64Url: string,
  privateKeyBase64Url: string,
): Promise<VapidKeys> {
  const publicKeyRaw = base64UrlDecode(publicKeyBase64Url);
  const privateKeyPkcs8 = base64UrlDecode(privateKeyBase64Url);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { publicKeyRaw, privateKey };
}

/** Builds the VAPID `Authorization` header value (RFC 8292) for a push to the given endpoint. */
export async function buildVapidAuthorizationHeader(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  // Web Crypto's ECDSA signature for P-256 is the raw r||s concatenation (64 bytes) — exactly
  // what a JWS ES256 signature needs, no DER conversion required.
  const signatureBits = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signatureBits))}`;
  return `vapid t=${jwt}, k=${base64UrlEncode(keys.publicKeyRaw)}`;
}

async function hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, lengthBytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, lengthBytes * 8);
  return new Uint8Array(bits);
}

export interface EncryptedPushPayload {
  /** The full `aes128gcm` content-encoding body: header || ciphertext (RFC 8188 / 8291). */
  body: Uint8Array;
}

/**
 * Encrypts a push payload for one subscriber, per RFC 8291. Each call generates a fresh
 * ephemeral ECDH keypair and a fresh random salt — nothing here is reused across messages or
 * subscribers, as the spec requires.
 */
export async function encryptPushPayload(
  subscription: PushSubscriptionRecord,
  plaintext: Uint8Array,
): Promise<EncryptedPushPayload> {
  const uaPublicRaw = base64UrlDecode(subscription.keys.p256dh);
  const authSecret = base64UrlDecode(subscription.keys.auth);

  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // @cloudflare/workers-types types generateKey() as `CryptoKey | CryptoKeyPair` without
  // narrowing by algorithm; ECDH always returns a pair.
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublicRaw = await exportKeyBytes("raw", asKeyPair.publicKey);

  // workers-types' *type* names this field `$public` (a codegen artifact), but the real workerd
  // runtime only recognizes the spec's actual key, `public` — satisfying the type checker here
  // would send the wrong field name. Build the real object and bypass the mistyped signature.
  const ecdhDeriveParams = { name: "ECDH", public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhDeriveParams, asKeyPair.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // RFC 8291 §3.3: combine the ECDH shared secret with the subscription's own auth secret,
  // binding the derivation to both parties' public keys.
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const prk = await hkdf(sharedSecret, authSecret, keyInfo, 32);

  // RFC 8291 §3.4 / RFC 8188: derive the record's content-encryption-key and nonce from that.
  const cek = await hkdf(prk, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(prk, salt, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // RFC 8188 padding: a single "last record" delimiter byte (0x02) after the plaintext.
  const padded = concatBytes(plaintext, new Uint8Array([2]));

  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded));

  // aes128gcm header (RFC 8188 §2.1): salt(16) || record-size(4, big-endian) || idlen(1) || keyid(idlen)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  const header = concatBytes(salt, recordSize, new Uint8Array([asPublicRaw.length]), asPublicRaw);

  return { body: concatBytes(header, ciphertext) };
}

/** Sends one Web Push message. `pushFetch` is injectable so tests never hit a real push service. */
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: Uint8Array,
  vapidKeys: VapidKeys,
  vapidSubject: string,
  pushFetch: typeof fetch = fetch,
): Promise<Response> {
  const { body } = await encryptPushPayload(subscription, payload);
  const authorization = await buildVapidAuthorizationHeader(subscription.endpoint, vapidKeys, vapidSubject);
  return pushFetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Authorization: authorization,
    },
    body,
  });
}

/**
 * Sends a push to every stored subscription (RF07). A subscription a push service reports gone
 * (404/410) is removed; a subscription that merely fails to reach (network error, 5xx) is left
 * alone for the next inspection to retry rather than deleted on a transient failure.
 */
export async function fanOutPush(
  env: Env,
  imageUrl: string,
  vapidKeys: VapidKeys,
  vapidSubject: string,
  pushFetch: typeof fetch = fetch,
): Promise<void> {
  const subscriptions = await listSubscriptions(env);
  const payload = new TextEncoder().encode(JSON.stringify({ imageUrl }));

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const response = await sendWebPush(subscription, payload, vapidKeys, vapidSubject, pushFetch);
        if (response.status === 404 || response.status === 410) {
          await deleteSubscription(env, subscription.endpoint);
        }
      } catch {
        // A network failure to one subscriber must not fail the whole fanout.
      }
    }),
  );
}

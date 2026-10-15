import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVapidAuthorizationHeader,
  encryptPushPayload,
  fanOutPush,
  importVapidKeys,
  type VapidKeys,
} from "../src/push.js";

function base64UrlDecodeToJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(atob(normalized + padding));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @cloudflare/workers-types types generateKey() as `CryptoKey | CryptoKeyPair` without
 * narrowing by algorithm name; both ECDSA and ECDH always return a pair. */
async function generateKeyPair(
  algorithm: { name: string; namedCurve: string },
  usages: string[],
): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(algorithm, true, usages)) as CryptoKeyPair;
}

// Same exportKey() cast push.ts needs — workers-types has one signature returning the union.
async function exportKeyBytes(format: "raw" | "pkcs8", key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array((await crypto.subtle.exportKey(format, key)) as ArrayBuffer);
}

async function generateTestVapidKeys(): Promise<VapidKeys> {
  const keyPair = await generateKeyPair({ name: "ECDSA", namedCurve: "P-256" }, ["sign", "verify"]);
  const publicKeyRaw = await exportKeyBytes("raw", keyPair.publicKey);
  return { publicKeyRaw, privateKey: keyPair.privateKey };
}

describe("importVapidKeys / buildVapidAuthorizationHeader", () => {
  it("round-trips an exported keypair and signs a well-shaped VAPID header", async () => {
    const generated = await generateKeyPair({ name: "ECDSA", namedCurve: "P-256" }, ["sign"]);
    const publicRaw = await exportKeyBytes("raw", generated.publicKey);
    const privatePkcs8 = await exportKeyBytes("pkcs8", generated.privateKey);

    const keys = await importVapidKeys(toBase64Url(publicRaw), toBase64Url(privatePkcs8));
    const header = await buildVapidAuthorizationHeader(
      "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys,
      "mailto:test@example.com",
    );

    const match = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(match).not.toBeNull();
    const [, jwt] = match!;
    const [headerPart, payloadPart] = jwt!.split(".");

    expect(base64UrlDecodeToJson(headerPart!)).toEqual({ typ: "JWT", alg: "ES256" });

    const payload = base64UrlDecodeToJson(payloadPart!) as { aud: string; sub: string; exp: number };
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:test@example.com");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe("encryptPushPayload", () => {
  it("produces a structurally valid aes128gcm body", async () => {
    const asKeyPair = await generateKeyPair({ name: "ECDH", namedCurve: "P-256" }, ["deriveBits"]);
    const p256dhRaw = await exportKeyBytes("raw", asKeyPair.publicKey);

    const plaintext = new TextEncoder().encode(JSON.stringify({ imageUrl: "https://example.com/x.png" }));
    const { body } = await encryptPushPayload(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh: toBase64Url(p256dhRaw), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
        createdAt: new Date().toISOString(),
      },
      plaintext,
    );

    // header = salt(16) + recordSize(4) + idlen(1) + keyid(65); ciphertext = plaintext + 1 padding byte + 16 GCM tag
    const expectedHeaderLength = 16 + 4 + 1 + 65;
    const expectedCiphertextLength = plaintext.length + 1 + 16;
    expect(body.length).toBe(expectedHeaderLength + expectedCiphertextLength);
    expect(body[16 + 4]).toBe(65); // idlen byte names the 65-byte uncompressed EC point that follows
  });
});

/** A subscription with real, validly-shaped EC key material — invalid bytes make
 * `encryptPushPayload` throw before `pushFetch` is ever reached, which would make the fanOutPush
 * tests below pass for the wrong reason (a swallowed exception, not an exercised code path). */
async function makeRealSubscription(endpoint: string) {
  const keyPair = await generateKeyPair({ name: "ECDH", namedCurve: "P-256" }, ["deriveBits"]);
  const p256dh = await exportKeyBytes("raw", keyPair.publicKey);
  return {
    endpoint,
    keys: { p256dh: toBase64Url(p256dh), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
    createdAt: new Date().toISOString(),
  };
}

describe("fanOutPush", () => {
  const subscriptionKey = "subscription:https://example.com/push/to-be-removed";
  let subscription: Awaited<ReturnType<typeof makeRealSubscription>>;

  beforeEach(async () => {
    subscription = await makeRealSubscription("https://example.com/push/to-be-removed");
    await env.SUBSCRIPTIONS.put(subscriptionKey, JSON.stringify(subscription));
  });

  it("deletes a subscription the push service reports gone (410)", async () => {
    const vapidKeys = await generateTestVapidKeys();
    const pushFetch = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));

    await fanOutPush(
      env,
      "https://example.com/latest.png",
      vapidKeys,
      "mailto:test@example.com",
      pushFetch as unknown as typeof fetch,
    );

    expect(pushFetch).toHaveBeenCalledTimes(1);
    const stored = await env.SUBSCRIPTIONS.get(subscriptionKey);
    expect(stored).toBeNull();
  });

  it("keeps a subscription on a successful push", async () => {
    const vapidKeys = await generateTestVapidKeys();
    const pushFetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));

    await fanOutPush(
      env,
      "https://example.com/latest.png",
      vapidKeys,
      "mailto:test@example.com",
      pushFetch as unknown as typeof fetch,
    );

    const stored = await env.SUBSCRIPTIONS.get(subscriptionKey);
    expect(stored).not.toBeNull();
  });

  it("does not throw when a subscriber's push fails to even reach (network error)", async () => {
    const vapidKeys = await generateTestVapidKeys();
    const pushFetch = vi.fn().mockRejectedValue(new Error("network unreachable"));

    await expect(
      fanOutPush(
        env,
        "https://example.com/latest.png",
        vapidKeys,
        "mailto:test@example.com",
        pushFetch as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();

    // A transient failure isn't treated the same as "gone" — the subscription stays.
    const stored = await env.SUBSCRIPTIONS.get(subscriptionKey);
    expect(stored).not.toBeNull();
  });
});

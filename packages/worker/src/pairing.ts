import { PairingClaimResult, PairingCode } from "@snaptritor/shared";
import type { Env } from "./env.js";

/**
 * RF16/RF18's pairing flow: the client requests a short code right after subscribing (RF08),
 * shows it to the player, and the collector claims it once on first run to get its own
 * per-install secret (constitution Article 8 — never a secret shared across every install; see
 * plan.md's Rejected alternatives for why the original single baked-in secret was dropped).
 */

const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 minutes — short enough to limit a guessed/leaked code's exposure
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I — avoids human mistyping

function pairingKeyFor(code: string): string {
  return `pairing:${code}`;
}

function linkedKeyFor(subscriptionEndpoint: string): string {
  return `linked:${subscriptionEndpoint}`;
}

function collectorSecretKeyFor(secret: string): string {
  return `collector-secret:${secret}`;
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `POST /pairing/code` (RF16): issues a fresh code tied to a subscription the client just registered. */
export async function handlePostPairingCode(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subscriptionEndpoint = (body as { subscriptionEndpoint?: unknown })?.subscriptionEndpoint;
  if (typeof subscriptionEndpoint !== "string" || subscriptionEndpoint.length === 0) {
    return Response.json({ error: "expected { subscriptionEndpoint: string }" }, { status: 400 });
  }

  const now = new Date();
  const code = generateCode();
  const record = PairingCode.parse({
    code,
    subscriptionEndpoint,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
    claimed: false,
  });

  await env.SUBSCRIPTIONS.put(pairingKeyFor(code), JSON.stringify(record), {
    expirationTtl: PAIRING_TTL_MS / 1000,
  });

  return Response.json({ code, expiresAt: record.expiresAt }, { status: 201 });
}

/** `POST /pairing/claim` (RF18): the collector's one-time use of the code the player typed. */
export async function handlePostPairingClaim(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const code = (body as { code?: unknown })?.code;
  if (typeof code !== "string" || code.length === 0) {
    return Response.json({ error: "expected { code: string }" }, { status: 400 });
  }

  const raw = await env.SUBSCRIPTIONS.get(pairingKeyFor(code));
  if (!raw) {
    return Response.json({ error: "code not found" }, { status: 404 });
  }

  const parsed = PairingCode.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return Response.json({ error: "stored pairing record was corrupt" }, { status: 500 });
  }
  const record = parsed.data;

  if (record.claimed) {
    return Response.json({ error: "code already used" }, { status: 409 });
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return Response.json({ error: "code expired" }, { status: 410 });
  }

  const collectorSecret = generateSecret();

  await env.SUBSCRIPTIONS.put(
    pairingKeyFor(code),
    JSON.stringify({ ...record, claimed: true } satisfies PairingCode),
  );
  await env.SUBSCRIPTIONS.put(
    collectorSecretKeyFor(collectorSecret),
    JSON.stringify({ issuedAt: new Date().toISOString(), subscriptionEndpoint: record.subscriptionEndpoint }),
  );
  await env.SUBSCRIPTIONS.put(linkedKeyFor(record.subscriptionEndpoint), "true");

  const result: PairingClaimResult = { collectorSecret };
  return Response.json(result, { status: 200 });
}

/** `GET /collector/status?endpoint=...` (RF16): whether a collector has linked this subscription. */
export async function handleGetCollectorStatus(request: Request, env: Env): Promise<Response> {
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return Response.json({ error: "expected ?endpoint=<subscription endpoint>" }, { status: 400 });
  }
  const linked = (await env.SUBSCRIPTIONS.get(linkedKeyFor(endpoint))) !== null;
  return Response.json({ linked });
}

/** Whether a secret presented to `POST /inspections` was actually issued by a pairing claim. */
export async function isValidCollectorSecret(env: Env, secret: string): Promise<boolean> {
  if (!secret) return false;
  return (await env.SUBSCRIPTIONS.get(collectorSecretKeyFor(secret))) !== null;
}

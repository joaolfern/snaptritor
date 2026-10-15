import { PushSubscriptionRecord } from "@snaptritor/shared";
import type { Env } from "./env.js";

/** Keys a subscription in KV by its own endpoint — re-subscribing the same endpoint just overwrites it. */
function kvKeyFor(endpoint: string): string {
  return `subscription:${endpoint}`;
}

/** `POST /subscriptions` (RF08): stores a push subscription the client just created. */
export async function handlePostSubscriptions(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = PushSubscriptionRecord.safeParse(body);
  if (!result.success) {
    return Response.json({ error: "invalid subscription", issues: result.error.issues }, { status: 400 });
  }

  await env.SUBSCRIPTIONS.put(kvKeyFor(result.data.endpoint), JSON.stringify(result.data));
  return Response.json({ ok: true }, { status: 201 });
}

/** Every stored subscription — used by the push fanout (T005). */
export async function listSubscriptions(env: Env): Promise<ReturnType<typeof PushSubscriptionRecord.parse>[]> {
  const subscriptions: ReturnType<typeof PushSubscriptionRecord.parse>[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.SUBSCRIPTIONS.list({ prefix: "subscription:", cursor });
    for (const key of page.keys) {
      const raw = await env.SUBSCRIPTIONS.get(key.name);
      if (!raw) continue;
      const parsed = PushSubscriptionRecord.safeParse(JSON.parse(raw));
      if (parsed.success) subscriptions.push(parsed.data);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return subscriptions;
}

/** Removes a subscription that the push service reported as gone (RF07's second half). */
export async function deleteSubscription(env: Env, endpoint: string): Promise<void> {
  await env.SUBSCRIPTIONS.delete(kvKeyFor(endpoint));
}

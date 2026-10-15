import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

function makeRequest(body: unknown): Request {
  return new Request("http://worker.local/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /subscriptions", () => {
  it("stores a valid subscription and returns 201", async () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-1",
      keys: { p256dh: "p256dh-key", auth: "auth-secret" },
      createdAt: new Date().toISOString(),
    };

    const response = await worker.fetch(makeRequest(subscription), env, {} as ExecutionContext);
    expect(response.status).toBe(201);

    const stored = await env.SUBSCRIPTIONS.get("subscription:https://fcm.googleapis.com/fcm/send/test-endpoint-1");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(subscription);
  });

  it("rejects an invalid subscription with 400 and stores nothing", async () => {
    const response = await worker.fetch(
      makeRequest({ endpoint: "not-a-url" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);

    const list = await env.SUBSCRIPTIONS.list({ prefix: "subscription:" });
    expect(list.keys).toHaveLength(0);
  });

  it("rejects a non-JSON body with 400", async () => {
    const request = new Request("http://worker.local/subscriptions", {
      method: "POST",
      body: "not json",
    });
    const response = await worker.fetch(request, env, {} as ExecutionContext);
    expect(response.status).toBe(400);
  });
});

describe("unknown routes", () => {
  it("returns 404", async () => {
    const request = new Request("http://worker.local/nonexistent");
    const response = await worker.fetch(request, env, {} as ExecutionContext);
    expect(response.status).toBe(404);
  });
});

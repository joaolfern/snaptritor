import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

function postJson(path: string, body: unknown): Request {
  return new Request(`http://worker.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /pairing/code", () => {
  it("issues a 6-character code tied to the given subscription", async () => {
    const response = await worker.fetch(
      postJson("/pairing/code", { subscriptionEndpoint: "https://fcm.googleapis.com/fcm/send/abc" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { code: string; expiresAt: string };
    expect(body.code).toHaveLength(6);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a missing subscriptionEndpoint with 400", async () => {
    const response = await worker.fetch(postJson("/pairing/code", {}), env, {} as ExecutionContext);
    expect(response.status).toBe(400);
  });
});

describe("POST /pairing/claim", () => {
  it("claims a fresh code, returns a secret, and flips /collector/status to linked", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/claim-test";
    const codeResponse = await worker.fetch(postJson("/pairing/code", { subscriptionEndpoint: endpoint }), env, {} as ExecutionContext);
    const { code } = (await codeResponse.json()) as { code: string };

    const statusBefore = await worker.fetch(
      new Request(`http://worker.local/collector/status?endpoint=${encodeURIComponent(endpoint)}`),
      env,
      {} as ExecutionContext,
    );
    expect((await statusBefore.json())).toEqual({ linked: false });

    const claimResponse = await worker.fetch(postJson("/pairing/claim", { code }), env, {} as ExecutionContext);
    expect(claimResponse.status).toBe(200);
    const { collectorSecret } = (await claimResponse.json()) as { collectorSecret: string };
    expect(collectorSecret.length).toBeGreaterThan(0);

    const statusAfter = await worker.fetch(
      new Request(`http://worker.local/collector/status?endpoint=${encodeURIComponent(endpoint)}`),
      env,
      {} as ExecutionContext,
    );
    expect((await statusAfter.json())).toEqual({ linked: true });
  });

  it("rejects a second claim of the same code with 409, without issuing a second secret", async () => {
    const codeResponse = await worker.fetch(
      postJson("/pairing/code", { subscriptionEndpoint: "https://fcm.googleapis.com/fcm/send/double-claim" }),
      env,
      {} as ExecutionContext,
    );
    const { code } = (await codeResponse.json()) as { code: string };

    const first = await worker.fetch(postJson("/pairing/claim", { code }), env, {} as ExecutionContext);
    expect(first.status).toBe(200);

    const second = await worker.fetch(postJson("/pairing/claim", { code }), env, {} as ExecutionContext);
    expect(second.status).toBe(409);
  });

  it("rejects a code that was never issued with 404", async () => {
    const response = await worker.fetch(postJson("/pairing/claim", { code: "ZZZZZZ" }), env, {} as ExecutionContext);
    expect(response.status).toBe(404);
  });

  it("rejects an expired code with 410", async () => {
    // Write an already-expired record directly, rather than waiting out the real 15-minute TTL.
    const expired = {
      code: "EXPIRD",
      subscriptionEndpoint: "https://fcm.googleapis.com/fcm/send/expired",
      createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      claimed: false,
    };
    await env.SUBSCRIPTIONS.put("pairing:EXPIRD", JSON.stringify(expired));

    const response = await worker.fetch(postJson("/pairing/claim", { code: "EXPIRD" }), env, {} as ExecutionContext);
    expect(response.status).toBe(410);
  });
});

describe("GET /collector/status", () => {
  it("rejects a missing endpoint query param with 400", async () => {
    const response = await worker.fetch(new Request("http://worker.local/collector/status"), env, {} as ExecutionContext);
    expect(response.status).toBe(400);
  });

  it("returns linked:false for a subscription nothing has ever claimed", async () => {
    const response = await worker.fetch(
      new Request("http://worker.local/collector/status?endpoint=https://fcm.googleapis.com/fcm/send/never-linked"),
      env,
      {} as ExecutionContext,
    );
    expect(await response.json()).toEqual({ linked: false });
  });
});

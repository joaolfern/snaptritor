import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index.js";

// Gets a real, freshly-issued per-install secret by actually going through the pairing flow
// (POST /pairing/code → POST /pairing/claim) rather than assuming any fixed value or internal KV
// key format — the auth check this exercises no longer compares against a single configured
// secret (RF18), so there is no fixed value to hardcode anymore.
async function getPairedSecret(subscriptionEndpoint: string): Promise<string> {
  const codeResponse = await worker.fetch(
    new Request("http://worker.local/pairing/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionEndpoint }),
    }),
    env,
    {} as ExecutionContext,
  );
  const { code } = (await codeResponse.json()) as { code: string };

  const claimResponse = await worker.fetch(
    new Request("http://worker.local/pairing/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
    env,
    {} as ExecutionContext,
  );
  const { collectorSecret } = (await claimResponse.json()) as { collectorSecret: string };
  return collectorSecret;
}

function makeInspectionRequest(options: {
  secret?: string;
  metadata?: unknown;
  omitImage?: boolean;
}): Request {
  const form = new FormData();
  if (options.metadata !== undefined) {
    form.set("metadata", JSON.stringify(options.metadata));
  }
  if (!options.omitImage) {
    form.set("image", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }), "shop.png");
  }
  return new Request("http://worker.local/inspections", {
    method: "POST",
    headers: options.secret === undefined ? {} : { "X-Collector-Secret": options.secret },
    body: form,
  });
}

let SECRET: string;

beforeEach(async () => {
  SECRET = await getPairedSecret(`https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`);
});

describe("POST /inspections", () => {
  it("rejects a missing/wrong secret with 401 and stores nothing", async () => {
    const response = await worker.fetch(
      makeInspectionRequest({ secret: "wrong", metadata: { capturedAt: new Date().toISOString(), imageHash: "abc" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(401);

    const list = await env.SHOP_IMAGES.list();
    expect(list.objects).toHaveLength(0);
  });

  it("rejects the old single dev-placeholder secret — it was never issued through pairing", async () => {
    const response = await worker.fetch(
      makeInspectionRequest({
        secret: "dev-test-secret-change-me",
        metadata: { capturedAt: new Date().toISOString(), imageHash: "abc" },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(401);
  });

  it("rejects an invalid metadata part with 400", async () => {
    const response = await worker.fetch(
      makeInspectionRequest({ secret: SECRET, metadata: { capturedAt: "not-a-date", imageHash: "abc" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
  });

  it("rejects a request missing the image part with 400", async () => {
    const response = await worker.fetch(
      makeInspectionRequest({
        secret: SECRET,
        metadata: { capturedAt: new Date().toISOString(), imageHash: "abc" },
        omitImage: true,
      }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
  });

  it("accepts a valid, authed submission: stores the image in R2 and returns its URL", async () => {
    const capturedAt = new Date().toISOString();
    const response = await worker.fetch(
      makeInspectionRequest({ secret: SECRET, metadata: { capturedAt, imageHash: "hash-1" } }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(201);

    const body = (await response.json()) as { ok: boolean; imageUrl: string };
    expect(body.ok).toBe(true);
    expect(body.imageUrl).toContain("/images/inspections%2F");

    const list = await env.SHOP_IMAGES.list({ prefix: "inspections/" });
    expect(list.objects.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /images/:key", () => {
  it("streams back a stored image with its content type", async () => {
    const capturedAt = new Date().toISOString();
    const postResponse = await worker.fetch(
      makeInspectionRequest({ secret: SECRET, metadata: { capturedAt, imageHash: "hash-2" } }),
      env,
      {} as ExecutionContext,
    );
    const { imageUrl } = (await postResponse.json()) as { imageUrl: string };

    const getResponse = await worker.fetch(new Request(imageUrl), env, {} as ExecutionContext);
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toBe("image/png");
    const bytes = new Uint8Array(await getResponse.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("returns 404 for a key that was never stored", async () => {
    const response = await worker.fetch(new Request("http://worker.local/images/nope"), env, {} as ExecutionContext);
    expect(response.status).toBe(404);
  });
});

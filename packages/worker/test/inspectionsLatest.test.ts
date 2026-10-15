import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

// Real, freshly-issued secret via the actual pairing flow — RF18 removed the single configured
// secret this used to hardcode.
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

describe("GET /inspections/latest", () => {
  it("returns 404 when nothing has been stored yet", async () => {
    const response = await worker.fetch(
      new Request("http://worker.local/inspections/latest"),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("returns the most recently posted inspection's metadata and URL", async () => {
    const secret = await getPairedSecret(`https://fcm.googleapis.com/fcm/send/latest-${crypto.randomUUID()}`);
    const capturedAt = new Date().toISOString();
    const form = new FormData();
    form.set("metadata", JSON.stringify({ capturedAt, imageHash: "latest-hash" }));
    form.set("image", new Blob([new Uint8Array([9, 9, 9])], { type: "image/png" }), "shop.png");

    await worker.fetch(
      new Request("http://worker.local/inspections", {
        method: "POST",
        headers: { "X-Collector-Secret": secret },
        body: form,
      }),
      env,
      {} as ExecutionContext,
    );

    const response = await worker.fetch(
      new Request("http://worker.local/inspections/latest"),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { capturedAt: string; imageUrl: string };
    expect(body.capturedAt).toBe(capturedAt);
    expect(body.imageUrl).toContain("/images/");
  });
});

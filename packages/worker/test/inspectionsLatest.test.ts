import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

const SECRET = "dev-test-secret-change-me";

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
    const capturedAt = new Date().toISOString();
    const form = new FormData();
    form.set("metadata", JSON.stringify({ capturedAt, imageHash: "latest-hash" }));
    form.set("image", new Blob([new Uint8Array([9, 9, 9])], { type: "image/png" }), "shop.png");

    await worker.fetch(
      new Request("http://worker.local/inspections", {
        method: "POST",
        headers: { "X-Collector-Secret": SECRET },
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

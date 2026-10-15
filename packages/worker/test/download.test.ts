import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("GET /download/collector", () => {
  it("returns 404 when the installer hasn't been uploaded yet", async () => {
    const response = await worker.fetch(
      new Request("http://worker.local/download/collector"),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(404);
  });

  it("streams the installer once it's been uploaded to R2", async () => {
    const fakeInstaller = new Uint8Array([0x4d, 0x5a, 1, 2, 3]); // "MZ" — a plausible PE header start
    await env.SHOP_IMAGES.put("installer/snaptritor-setup.exe", fakeInstaller);

    const response = await worker.fetch(
      new Request("http://worker.local/download/collector"),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("snaptritor-setup.exe");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(fakeInstaller));
  });
});

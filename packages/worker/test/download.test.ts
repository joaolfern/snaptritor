import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("GET /download/collector", () => {
  it("redirects to the installer's GitHub Release asset (RF19/T020: one artifact, not an R2 copy kept in sync by hand)", async () => {
    const response = await worker.fetch(
      new Request("http://worker.local/download/collector", { redirect: "manual" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://github.com/joaolfern/snaptritor/releases/latest/download/snaptritor-setup.exe",
    );
  });
});

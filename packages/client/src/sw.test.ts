import { describe, expect, it } from "vitest";
import { buildNotificationOptions } from "./sw.js";

describe("buildNotificationOptions", () => {
  it("sets image to the exact URL from the payload", () => {
    const options = buildNotificationOptions({ imageUrl: "https://example.com/images/abc123" });
    expect(options.image).toBe("https://example.com/images/abc123");
  });

  it("names no card or cost — nothing here decodes what the screenshot shows", () => {
    const options = buildNotificationOptions({ imageUrl: "https://example.com/images/abc123" });
    const allText = JSON.stringify(options).toLowerCase();
    expect(allText).not.toMatch(/karen|miek|gamora|silk|token|cost/);
  });

  it("is a pure function of its input — same payload, same options", () => {
    const payload = { imageUrl: "https://example.com/images/xyz" };
    expect(buildNotificationOptions(payload)).toEqual(buildNotificationOptions(payload));
  });
});

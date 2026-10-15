import { describe, expect, it } from "vitest";
import { pairingStatusUrl, urlBase64ToUint8Array } from "./pure.js";

describe("pairingStatusUrl", () => {
  it("URL-encodes the subscription endpoint", () => {
    expect(pairingStatusUrl("https://fcm.googleapis.com/fcm/send/abc 123")).toBe(
      "/collector/status?endpoint=https%3A%2F%2Ffcm.googleapis.com%2Ffcm%2Fsend%2Fabc%20123",
    );
  });
});

describe("urlBase64ToUint8Array", () => {
  it("round-trips a known base64url string to the expected bytes", () => {
    // "AQID" (base64) == bytes [1,2,3]; same string is also valid base64url (no -/_ chars here).
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("handles base64url-specific characters (-, _) and missing padding", () => {
    // base64url "-_8" (no padding) decodes the same as standard base64 "+/8=" -> bytes [251, 255]
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

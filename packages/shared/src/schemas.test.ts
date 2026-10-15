import { describe, expect, it } from "vitest";
import {
  CollectorState,
  INITIAL_COLLECTOR_STATE,
  InspectionSubmission,
  PairingClaimResult,
  PairingCode,
  PushSubscriptionRecord,
} from "./schemas.js";

describe("CollectorState", () => {
  it("rejects an empty object — nothing here silently defaults", () => {
    const result = CollectorState.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts the documented initial state", () => {
    const result = CollectorState.safeParse(INITIAL_COLLECTOR_STATE);
    expect(result.success).toBe(true);
  });

  it("round-trips through parse without mutation", () => {
    const parsed = CollectorState.parse(INITIAL_COLLECTOR_STATE);
    expect(parsed).toEqual(INITIAL_COLLECTOR_STATE);
  });
});

describe("InspectionSubmission", () => {
  it("accepts a valid submission", () => {
    const result = InspectionSubmission.safeParse({
      capturedAt: new Date().toISOString(),
      imageHash: "0123456789abcdef",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-ISO capturedAt", () => {
    const result = InspectionSubmission.safeParse({
      capturedAt: "not-a-date",
      imageHash: "0123456789abcdef",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty imageHash", () => {
    const result = InspectionSubmission.safeParse({
      capturedAt: new Date().toISOString(),
      imageHash: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("PushSubscriptionRecord", () => {
  it("accepts a realistic browser-shaped subscription", () => {
    const result = PushSubscriptionRecord.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "p256dh-key", auth: "auth-secret" },
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL endpoint", () => {
    const result = PushSubscriptionRecord.safeParse({
      endpoint: "not-a-url",
      keys: { p256dh: "p256dh-key", auth: "auth-secret" },
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe("PairingCode", () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);

  it("accepts a fresh, unclaimed code", () => {
    const result = PairingCode.safeParse({
      code: "ABC123",
      subscriptionEndpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      createdAt: now.toISOString(),
      expiresAt: soon.toISOString(),
      claimed: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a code that isn't exactly 6 characters", () => {
    const result = PairingCode.safeParse({
      code: "ABC12",
      subscriptionEndpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      createdAt: now.toISOString(),
      expiresAt: soon.toISOString(),
      claimed: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("PairingClaimResult", () => {
  it("accepts an issued secret", () => {
    const result = PairingClaimResult.safeParse({ collectorSecret: "a-fresh-per-install-secret" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing secret", () => {
    const result = PairingClaimResult.safeParse({});
    expect(result.success).toBe(false);
  });
});

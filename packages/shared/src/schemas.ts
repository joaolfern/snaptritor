import { z } from "zod";

/**
 * The shared contracts crossing a package boundary (constitution Article 5).
 * Neither the collector nor the worker re-declares these — both import from here.
 */

/**
 * What the collector POSTs to the Worker's `/inspections` alongside the raw image bytes.
 * The image itself travels as the request body, never inside this JSON (see plan.md).
 */
export const InspectionSubmission = z.object({
  capturedAt: z.string().datetime(),
  imageHash: z.string().min(1),
});
export type InspectionSubmission = z.infer<typeof InspectionSubmission>;

/** A Web Push subscription, as the browser's Push API hands it to the client. */
export const PushSubscriptionRecord = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  createdAt: z.string().datetime(),
});
export type PushSubscriptionRecord = z.infer<typeof PushSubscriptionRecord>;

/**
 * The collector's own local state, persisted as JSON on the PC (never committed, never
 * uploaded). Every field is required or explicitly nullable — nothing here silently defaults,
 * since a missing field here is a bug in the collector, not a normal "not set yet" state.
 */
export const CollectorState = z.object({
  lastInspectionAt: z.string().datetime().nullable(),
  nextInspectionAt: z.string().datetime().nullable(),
  inspectionPaused: z.boolean(),
  wakeAutomationPaused: z.boolean(),
  lastImageHash: z.string().nullable(),
  lastError: z.string().nullable(),
  /** Issued by `POST /pairing/claim` on first run (RF18). `null` means the pairing prompt shows. */
  collectorSecret: z.string().nullable(),
});
export type CollectorState = z.infer<typeof CollectorState>;

/** The initial state a fresh install starts from (constitution Article 7: no hidden defaults). */
export const INITIAL_COLLECTOR_STATE: CollectorState = {
  lastInspectionAt: null,
  nextInspectionAt: null,
  inspectionPaused: false,
  wakeAutomationPaused: false,
  lastImageHash: null,
  lastError: null,
  collectorSecret: null,
};

/**
 * RF16/RF18 — a short code the client requests right after subscribing (RF08), shown to the
 * player, and consumed exactly once by the collector on first run.
 */
export const PairingCode = z.object({
  code: z.string().length(6),
  subscriptionEndpoint: z.string().url(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  claimed: z.boolean(),
});
export type PairingCode = z.infer<typeof PairingCode>;

/**
 * What the collector gets back from a successful `POST /pairing/claim` — its own per-install
 * secret (Article 8: never a secret shared across every install).
 */
export const PairingClaimResult = z.object({
  collectorSecret: z.string(),
});
export type PairingClaimResult = z.infer<typeof PairingClaimResult>;

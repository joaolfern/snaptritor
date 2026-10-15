import { InspectionSubmission } from "@snaptritor/shared";
import type { Env } from "./env.js";
import { fanOutPush, importVapidKeys } from "./push.js";

const LATEST_KEY = "inspection:latest";

interface StoredInspection {
  capturedAt: string;
  imageHash: string;
  imageKey: string;
  contentType: string;
}

function sanitizeForKey(capturedAt: string): string {
  // Timestamps are ISO 8601; ":" isn't a great R2 key character, so swap it out.
  return capturedAt.replace(/[:]/g, "-");
}

function imageUrlFor(request: Request, imageKey: string): string {
  return new URL(`/images/${encodeURIComponent(imageKey)}`, request.url).toString();
}

/**
 * `POST /inspections` (RF05, RF06): the collector's upload after it detects a change. Body is
 * `multipart/form-data` with two parts — `metadata` (JSON matching `InspectionSubmission`) and
 * `image` (the screenshot bytes) — so the image never has to be base64-inflated inside JSON.
 */
export async function handlePostInspections(request: Request, env: Env): Promise<Response> {
  const providedSecret = request.headers.get("X-Collector-Secret");
  if (providedSecret !== env.COLLECTOR_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const metadataRaw = formData.get("metadata");
  const imagePart = formData.get("image");

  // formData.get() returns `File | string | null`; a file part is never a plain string.
  // Cast structurally rather than relying on control-flow narrowing of `File` here — workers-types
  // ships several date-versioned ambient declaration sets and which one resolves for `File` has
  // proven inconsistent with narrowing in this setup; the runtime shape is what actually matters.
  if (typeof metadataRaw !== "string" || imagePart === null || typeof imagePart === "string") {
    return Response.json({ error: "expected 'metadata' (JSON) and 'image' (file) parts" }, { status: 400 });
  }
  const imageFile = imagePart as unknown as { type: string; arrayBuffer(): Promise<ArrayBuffer> };

  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(metadataRaw);
  } catch {
    return Response.json({ error: "'metadata' part was not valid JSON" }, { status: 400 });
  }

  const parsed = InspectionSubmission.safeParse(metadataJson);
  if (!parsed.success) {
    return Response.json({ error: "invalid inspection submission", issues: parsed.error.issues }, { status: 400 });
  }

  const contentType = imageFile.type || "image/png";
  const imageKey = `inspections/${sanitizeForKey(parsed.data.capturedAt)}-${parsed.data.imageHash}`;
  await env.SHOP_IMAGES.put(imageKey, await imageFile.arrayBuffer(), { httpMetadata: { contentType } });

  const stored: StoredInspection = {
    capturedAt: parsed.data.capturedAt,
    imageHash: parsed.data.imageHash,
    imageKey,
    contentType,
  };
  await env.SUBSCRIPTIONS.put(LATEST_KEY, JSON.stringify(stored));

  const imageUrl = imageUrlFor(request, imageKey);

  // Fan out the push after storing, so a push failure never loses the stored inspection.
  const vapidKeys = await importVapidKeys(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  await fanOutPush(env, imageUrl, vapidKeys, env.VAPID_SUBJECT);

  return Response.json({ ok: true, imageUrl }, { status: 201 });
}

/** `GET /inspections/latest` (RF09, server side): the most recently stored inspection. */
export async function handleGetLatestInspection(request: Request, env: Env): Promise<Response> {
  const raw = await env.SUBSCRIPTIONS.get(LATEST_KEY);
  if (!raw) {
    return Response.json({ error: "no inspection stored yet" }, { status: 404 });
  }
  const stored = JSON.parse(raw) as StoredInspection;
  return Response.json({
    capturedAt: stored.capturedAt,
    imageUrl: imageUrlFor(request, stored.imageKey),
  });
}

/** `GET /images/:key` — streams a stored screenshot back out of R2 with its content type. */
export async function handleGetImage(env: Env, imageKey: string): Promise<Response> {
  const object = await env.SHOP_IMAGES.get(imageKey);
  if (!object) {
    return new Response("not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream" },
  });
}

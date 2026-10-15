import { handleGetDownloadCollector } from "./download.js";
import type { Env } from "./env.js";
import { handleGetImage, handleGetLatestInspection, handlePostInspections } from "./inspections.js";
import { handleGetCollectorStatus, handlePostPairingClaim, handlePostPairingCode } from "./pairing.js";
import { handlePostSubscriptions } from "./subscriptions.js";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/subscriptions") {
      return handlePostSubscriptions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/inspections") {
      return handlePostInspections(request, env);
    }

    if (request.method === "GET" && url.pathname === "/inspections/latest") {
      return handleGetLatestInspection(request, env);
    }

    if (request.method === "GET" && url.pathname.startsWith("/images/")) {
      const imageKey = decodeURIComponent(url.pathname.slice("/images/".length));
      return handleGetImage(env, imageKey);
    }

    if (request.method === "POST" && url.pathname === "/pairing/code") {
      return handlePostPairingCode(request, env);
    }

    if (request.method === "POST" && url.pathname === "/pairing/claim") {
      return handlePostPairingClaim(request, env);
    }

    if (request.method === "GET" && url.pathname === "/collector/status") {
      return handleGetCollectorStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/download/collector") {
      return handleGetDownloadCollector();
    }

    // RF08 needs this to subscribe at all: pushManager.subscribe() requires the VAPID public key
    // as its applicationServerKey, and the client (a static build) has no other way to know it —
    // not scoped explicitly in T015's own task text, but a direct, necessary consequence of it.
    if (request.method === "GET" && url.pathname === "/vapid-public-key") {
      return new Response(env.VAPID_PUBLIC_KEY, { headers: { "Content-Type": "text/plain" } });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

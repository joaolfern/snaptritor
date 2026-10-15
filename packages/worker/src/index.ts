import type { Env } from "./env.js";
import { handleGetImage, handleGetLatestInspection, handlePostInspections } from "./inspections.js";
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

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

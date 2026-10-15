import type { Env } from "./env.js";
import { handlePostSubscriptions } from "./subscriptions.js";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/subscriptions") {
      return handlePostSubscriptions(request, env);
    }

    // T004 adds POST /inspections, T006 adds GET /inspections/latest.

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

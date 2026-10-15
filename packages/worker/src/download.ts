import type { Env } from "./env.js";

/**
 * Where the installer `.exe` lives in R2 — the same bucket `SHOP_IMAGES` already binds (its name
 * is a minor mismatch here; not worth a second R2 bucket/binding for one more file type). T016's
 * checkpoint uploads the built installer to this key.
 */
const INSTALLER_KEY = "installer/snaptritor-setup.exe";

/** `GET /download/collector` (RF17): streams the Windows installer straight from R2. */
export async function handleGetDownloadCollector(env: Env): Promise<Response> {
  const object = await env.SHOP_IMAGES.get(INSTALLER_KEY);
  if (!object) {
    return Response.json({ error: "installer not uploaded yet" }, { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="snaptritor-setup.exe"',
    },
  });
}

// functions/index.ts — the entrypoint for the BoundaryLab Range's backend.
//
// Exposes a small, unauthenticated "temporary secure link" store: a client
// POSTs a JSON blob (a compiled session export), gets back a random,
// unguessable id valid for 24h, and anyone with the resulting link can GET
// it back until it expires. Storage/expiry lives in the SharedReport
// Durable Object (one instance per share id).
export { SharedReport, MAX_BODY_BYTES } from "./shared-report";

type Env = {
  DO: Fetcher & {
    setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>;
  };
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS });
}

/** New ids: 22-char base64url (16 CSPRNG bytes, no padding). */
const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** Legacy ids (pre-audit): 16 chars from alnum only — still accepted on GET for 24h TTL overlap. */
const LEGACY_SHARE_ID_RE = /^[A-Za-z0-9]{16}$/;

/**
 * Cryptographically random, unbiased share id.
 * Encodes 16 CSPRNG bytes as base64url without padding (22 chars).
 */
export function randomShareId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa is available on Workers; map to URL-safe alphabet and strip padding.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidShareId(id: string): boolean {
  return SHARE_ID_RE.test(id) || LEGACY_SHARE_ID_RE.test(id);
}

function doRequest(path: string, id: string, init?: RequestInit): Request {
  const request = new Request(`https://internal${path}`, init);
  request.headers.set("X-Rork-DO-Class", "SharedReport");
  request.headers.set("X-Rork-DO-Id", id);
  return request;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "POST" && url.pathname === "/share") {
      const bodyText = await request.text();
      if (bodyText.length > 1_000_000) {
        return json({ error: "payload too large" }, 413);
      }
      try {
        JSON.parse(bodyText);
      } catch {
        return json({ error: "invalid json body" }, 400);
      }

      const id = randomShareId();
      const storeRes = await env.DO.fetch(
        doRequest("/store", id, {
          method: "PUT",
          body: bodyText,
          headers: { "Content-Type": "application/json" },
        }),
      );

      if (!storeRes.ok) {
        const detail = await storeRes.json().catch(() => null);
        return json({ error: "failed to store report", detail }, 500);
      }

      const meta = (await storeRes.json()) as { createdAt: number; expiresAt: number };
      return json({ id, createdAt: meta.createdAt, expiresAt: meta.expiresAt });
    }

    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      // Only accept a single path segment as the id (reject /share/a/b and encoded junk).
      const raw = url.pathname.slice("/share/".length);
      const id = decodeURIComponent(raw.split("/")[0] ?? "").trim();
      if (!id) return json({ error: "missing id" }, 400);
      if (!isValidShareId(id)) return json({ error: "invalid id" }, 400);

      const fetchRes = await env.DO.fetch(doRequest("/fetch", id, { method: "GET" }));
      if (fetchRes.status === 404) {
        return json({ error: "not found or expired" }, 404);
      }
      if (!fetchRes.ok) {
        return json({ error: "failed to load report" }, 500);
      }

      const record = (await fetchRes.json()) as { payload: unknown; createdAt: number; expiresAt: number };
      return json(record);
    }

    if (url.pathname === "/ping") {
      return json({ ok: true, now: new Date().toISOString() });
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

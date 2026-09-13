/**
 * Client for the BoundaryLab Range's temporary report-sharing backend.
 *
 * Uploads a compiled session export to a short-lived, unguessable-URL store
 * (Cloudflare Worker + Durable Object, 24h TTL) so a session's detection
 * telemetry and spoof verdict can be handed off for review — e.g. AI
 * analysis — via a single link, without depending on one browser tab's
 * local storage.
 */
import type { SessionExport } from "./exportReport";
import { isValidShareId } from "./shareId";

const BACKEND_URL = import.meta.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL;

export class ShareError extends Error {}

export interface ShareResult {
  id: string;
  url: string;
  expiresAt: number;
}

export interface SharedRecord {
  payload: SessionExport;
  createdAt: number;
  expiresAt: number;
}

function requireBackendUrl(): string {
  if (!BACKEND_URL) {
    throw new ShareError("Sharing backend is not configured for this project.");
  }
  return BACKEND_URL;
}

/** Uploads a session export and returns a copyable, time-limited share link. */
export async function shareSessionExport(data: SessionExport): Promise<ShareResult> {
  const backend = requireBackendUrl();

  const res = await fetch(`${backend}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = typeof detail?.error === "string" ? detail.error : `Upload failed (${res.status})`;
    throw new ShareError(message);
  }

  const body = (await res.json()) as { id: string; expiresAt: number };
  return {
    id: body.id,
    url: `${window.location.origin}/share/${body.id}`,
    expiresAt: body.expiresAt,
  };
}

/** Fetches a previously shared session export by id. Throws if missing, malformed, or expired. */
export async function fetchSharedExport(id: string): Promise<SharedRecord> {
  if (!isValidShareId(id)) {
    throw new ShareError("Invalid share link.");
  }
  const backend = requireBackendUrl();

  const res = await fetch(`${backend}/share/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    throw new ShareError("This shared report was not found or has expired.");
  }
  if (!res.ok) {
    throw new ShareError(`Failed to load shared report (${res.status})`);
  }

  const body = (await res.json()) as Partial<SharedRecord>;
  if (!body || typeof body !== "object" || body.payload == null) {
    throw new ShareError("Shared report payload is malformed.");
  }
  return body as SharedRecord;
}

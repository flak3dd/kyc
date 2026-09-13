// functions/shared-report.ts — Durable Object backing the BoundaryLab Range's
// temporary report-sharing links. Each instance is keyed by a random,
// unguessable share id and stores exactly one JSON blob (a compiled session
// export) for a limited time window before it self-deletes.
import { DurableObject } from "cloudflare:workers";

/** How long a shared report stays retrievable after upload. */
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Defensive cap — well above a real session export, guards against abuse. */
export const MAX_BODY_BYTES = 1_000_000; // 1 MB

interface StoredReport {
  payload: unknown;
  createdAt: number;
  expiresAt: number;
}

type Env = {
  DO: Fetcher & {
    setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>;
  };
};

export class SharedReport extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "PUT" && url.pathname === "/store") {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return Response.json({ error: "payload too large" }, { status: 413 });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }

      const createdAt = Date.now();
      const expiresAt = createdAt + TTL_MS;
      const record: StoredReport = { payload, createdAt, expiresAt };

      await this.ctx.storage.put("record", record);
      // Self-expire even with zero further inbound traffic.
      await this.env.DO.setAlarm("SharedReport", this.ctx.id.name ?? "", expiresAt);

      return Response.json({ ok: true, createdAt, expiresAt });
    }

    if (request.method === "GET" && url.pathname === "/fetch") {
      const record = await this.ctx.storage.get<StoredReport>("record");
      if (!record || record.expiresAt < Date.now()) {
        return Response.json({ error: "not found or expired" }, { status: 404 });
      }
      return Response.json(record);
    }

    return new Response("not found", { status: 404 });
  }

  /** Fires at expiry — scrubs the stored blob even if nobody ever re-reads it. */
  async onAlarm(): Promise<void> {
    await this.ctx.storage.delete("record");
  }
}

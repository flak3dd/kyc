/**
 * Compiles the current range session into a single, self-contained JSON
 * document intended for AI-assisted analysis of an interception attempt.
 *
 * The shape is deliberately flat and pre-aggregated (counts, breakdowns,
 * timeline deltas) rather than a raw dump, so a model can reason about the
 * session without having to re-derive statistics from scratch.
 */
import type { RangeReport, StreamSignals, Severity, Surface, TelemetryEvent } from "./types";

interface RangeStateLike {
  events: TelemetryEvent[];
  signals: StreamSignals;
  report: RangeReport | null;
  sessionLabel: string | null;
  sessionStartedAt: number | null;
}

export interface SessionExport {
  exportedAt: string;
  session: {
    label: string;
    startedAt: string | null;
    durationMs: number | null;
    eventCount: number;
  };
  verdict: {
    verdict: RangeReport["verdict"];
    score: number | null;
    checks: RangeReport["checks"];
    updatedAt: string | null;
  };
  streamSignals: StreamSignals;
  summary: {
    bySeverity: Record<Severity, number>;
    bySurface: Partial<Record<Surface, number>>;
    failCount: number;
    warnCount: number;
  };
  timeline: Array<{
    tSinceStartMs: number;
    surface: Surface;
    severity: Severity;
    label: string;
    detail?: string;
  }>;
}

/** Builds a concise, AI-analysis-ready snapshot of the current session state. */
export function buildSessionExport(state: RangeStateLike): SessionExport {
  const startedAt = state.sessionStartedAt;
  const now = Date.now();

  const bySeverity: Record<Severity, number> = { info: 0, pass: 0, warn: 0, fail: 0 };
  const bySurface: Partial<Record<Surface, number>> = {};

  for (const e of state.events) {
    bySeverity[e.severity] += 1;
    bySurface[e.surface] = (bySurface[e.surface] ?? 0) + 1;
  }

  const timeline = state.events
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .map((e) => ({
      tSinceStartMs: startedAt !== null ? e.ts - startedAt : 0,
      surface: e.surface,
      severity: e.severity,
      label: e.label,
      ...(e.detail ? { detail: e.detail } : {}),
    }));

  return {
    exportedAt: new Date(now).toISOString(),
    session: {
      label: state.sessionLabel ?? "Untitled session",
      startedAt: startedAt !== null ? new Date(startedAt).toISOString() : null,
      durationMs: startedAt !== null ? now - startedAt : null,
      eventCount: state.events.length,
    },
    verdict: {
      verdict: state.report?.verdict ?? "pending",
      score: state.report?.score ?? null,
      checks: state.report?.checks ?? [],
      updatedAt: state.report ? new Date(state.report.updatedAt).toISOString() : null,
    },
    streamSignals: state.signals,
    summary: {
      bySeverity,
      bySurface,
      failCount: bySeverity.fail,
      warnCount: bySeverity.warn,
    },
    timeline,
  };
}

/** Triggers a browser download of the session export as a formatted JSON file. */
export function downloadSessionExport(state: RangeStateLike): void {
  const data = buildSessionExport(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const slug = (state.sessionLabel ?? "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "session";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `boundarylab-range_${slug}_${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

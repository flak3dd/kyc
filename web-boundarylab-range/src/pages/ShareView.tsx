import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Loader2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { TelemetryFeed } from "@/components/range/TelemetryFeed";
import { VerdictBadge } from "@/components/range/VerdictBadge";
import type { SessionExport } from "@/lib/exportReport";
import { fetchSharedExport, ShareError } from "@/lib/shareReport";
import type { TelemetryEvent } from "@/lib/types";

type LoadState = "loading" | "error" | "ready";

const ShareView = () => {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionExport | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing share id.");
      setState("error");
      return;
    }
    let cancelled = false;
    fetchSharedExport(id)
      .then((record) => {
        if (cancelled) return;
        setData(record.payload);
        setExpiresAt(record.expiresAt);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ShareError ? err.message : "Failed to load shared report.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boundarylab-range_shared-${id ?? "session"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const timelineAsEvents: TelemetryEvent[] = data
    ? data.timeline.map((t, i) => ({
        id: `${i}`,
        ts: (data.session.startedAt ? new Date(data.session.startedAt).getTime() : 0) + t.tSinceStartMs,
        surface: t.surface,
        severity: t.severity,
        label: t.label,
        detail: t.detail,
      }))
    : [];

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link to="/console" className="mb-8 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Console
        </Link>

        {state === "loading" && (
          <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shared report…
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {state === "ready" && data && (
          <>
            <div className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-indigo-400">
              Shared session report
            </div>
            <h1 className="mb-1 text-2xl font-semibold text-white">{data.session.label}</h1>
            {expiresAt && (
              <p className="mb-6 text-xs text-slate-500">Link expires {new Date(expiresAt).toLocaleString()}</p>
            )}

            <div className="mb-6 flex flex-wrap items-center gap-3">
              <VerdictBadge verdict={data.verdict.verdict} score={data.verdict.score ?? undefined} />
              <span className="text-xs text-slate-500">
                {data.summary.failCount} fail · {data.summary.warnCount} warn across {data.session.eventCount} events
              </span>
              <button
                onClick={handleDownload}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
              >
                <Download className="h-3.5 w-3.5" />
                Download JSON
              </button>
            </div>

            {data.verdict.checks.length > 0 && (
              <div className="mb-8 grid gap-2 sm:grid-cols-2">
                {data.verdict.checks.map((c) => (
                  <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-200">{c.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase ${
                          c.status === "fail"
                            ? "bg-rose-500/15 text-rose-300"
                            : c.status === "warn"
                              ? "bg-amber-500/15 text-amber-300"
                              : c.status === "pass"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-slate-500/15 text-slate-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.detail}</p>
                  </div>
                ))}
              </div>
            )}

            <TelemetryFeed events={timelineAsEvents} />
          </>
        )}
      </div>
    </div>
  );
};

export default ShareView;

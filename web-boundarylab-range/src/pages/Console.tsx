import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, Download, Gauge, Loader2, Radio, Share2, ShieldQuestion, Timer, Trash2, Waves } from "lucide-react";
import { Link } from "react-router-dom";

import { TelemetryFeed } from "@/components/range/TelemetryFeed";
import { VerdictBadge } from "@/components/range/VerdictBadge";
import { buildSessionExport, downloadSessionExport } from "@/lib/exportReport";
import { rangeStore, useRangeState } from "@/lib/rangeStore";
import { shareSessionExport, ShareError, type ShareResult } from "@/lib/shareReport";
import type { Surface } from "@/lib/types";

const SURFACE_LABEL: Record<Surface, string> = {
  "gum-main": "Main-frame camera",
  "gum-iframe": "Iframe camera",
  "file-chooser": "File chooser",
  enumerate: "Device enumeration",
  display: "Display media",
  fingerprint: "Fingerprinting",
};

function MetricTile({ icon: Icon, label, value, warn }: { icon: typeof Gauge; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${warn ? "text-amber-400" : "text-indigo-400"}`} />
        {label}
      </div>
      <p className={`mt-1.5 font-mono text-xl font-semibold ${warn ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

type ShareState = "idle" | "uploading" | "ready" | "error";

const Console = () => {
  const state = useRangeState();
  const { events, signals, report, sessionLabel, sessionStartedAt } = state;

  const [shareState, setShareState] = useState<ShareState>("idle");
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    setShareState("uploading");
    setShareError(null);
    try {
      const exportData = buildSessionExport(state);
      const result = await shareSessionExport(exportData);
      setShareResult(result);
      setShareState("ready");
    } catch (err) {
      setShareError(err instanceof ShareError ? err.message : "Upload failed. Try again.");
      setShareState("error");
    }
  };

  const handleCopy = async () => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable -- the link is still selectable/visible in the panel.
    }
  };

  const surfaceCounts = useMemo(() => {
    const counts: Partial<Record<Surface, number>> = {};
    for (const e of events) counts[e.surface] = (counts[e.surface] ?? 0) + 1;
    return counts;
  }, [events]);

  const failCount = events.filter((e) => e.severity === "fail").length;
  const warnCount = events.filter((e) => e.severity === "warn").length;

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-4 w-4" />
            Range
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              disabled={events.length === 0 || shareState === "uploading"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-300 transition-colors hover:border-violet-500/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {shareState === "uploading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              Share Link
            </button>
            <button
              onClick={() => downloadSessionExport(state)}
              disabled={events.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-indigo-500/40 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-slate-400"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
            <button
              onClick={() => rangeStore.reset()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {shareState === "ready" && shareResult && (
          <div className="mb-8 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-violet-300">
              <Share2 className="h-3.5 w-3.5" />
              Shareable link -- expires {new Date(shareResult.expiresAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareResult.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-300 outline-none"
              />
              <button
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-500/25"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Anyone with this link can view and download the compiled telemetry and verdict -- no login required. It self-deletes after 24 hours.
            </p>
          </div>
        )}

        {shareState === "error" && shareError && (
          <div className="mb-8 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {shareError}
          </div>
        )}

        <header className="mb-8">
          <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-indigo-400">
            <Radio className="h-3.5 w-3.5" />
            Operator console
          </div>
          <h1 className="text-2xl font-semibold text-white">
            {sessionLabel ?? "No active session"}
          </h1>
          {sessionStartedAt && (
            <p className="text-xs text-slate-500">
              Started {new Date(sessionStartedAt).toLocaleString()}
            </p>
          )}
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          {report ? (
            <VerdictBadge verdict={report.verdict} score={report.score} />
          ) : (
            <VerdictBadge verdict="pending" />
          )}
          <span className="text-xs text-slate-500">
            {failCount} fail · {warnCount} warn across {events.length} events
          </span>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile icon={Gauge} label="Frame rate" value={`${signals.fps.toFixed(1)} fps`} warn={signals.active && signals.fps < 15} />
          <MetricTile icon={Timer} label="Longest freeze" value={`${signals.frozenMs}ms`} warn={signals.frozenMs > 300} />
          <MetricTile icon={Waves} label="Motion variance" value={signals.variance.toFixed(1)} warn={signals.active && signals.variance < 0.4} />
          <MetricTile
            icon={ShieldQuestion}
            label="Acquisition"
            value={signals.gumResolveMs !== null ? `${signals.gumResolveMs}ms` : "—"}
            warn={signals.gumResolveMs !== null && signals.gumResolveMs < 15}
          />
        </div>

        {report && report.checks.length > 0 && (
          <div className="mb-8 grid gap-2 sm:grid-cols-2">
            {report.checks.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
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

        <div className="mb-8 flex flex-wrap gap-2">
          {(Object.keys(surfaceCounts) as Surface[]).map((s) => (
            <div key={s} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
              {SURFACE_LABEL[s]} <span className="font-mono text-slate-500">×{surfaceCounts[s]}</span>
            </div>
          ))}
        </div>

        <TelemetryFeed events={events} />
      </div>
    </div>
  );
};

export default Console;

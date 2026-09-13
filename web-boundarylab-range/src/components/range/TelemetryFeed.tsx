import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Severity, TelemetryEvent } from "@/lib/types";

const SEVERITY_DOT: Record<Severity, string> = {
  info: "bg-slate-400",
  pass: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-rose-400",
};

const SURFACE_LABEL: Record<TelemetryEvent["surface"], string> = {
  "gum-main": "GUM · main frame",
  "gum-iframe": "GUM · iframe",
  "file-chooser": "File chooser",
  enumerate: "Enumerate",
  display: "Display media",
  fingerprint: "Fingerprint",
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function TelemetryFeed({ events, className }: { events: TelemetryEvent[]; className?: string }) {
  const ordered = [...events].reverse();
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Activity className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-medium text-slate-200">Live telemetry</span>
        <span className="ml-auto font-mono text-xs text-slate-500">{events.length} events</span>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {ordered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No events yet. Run a station to see capture-surface activity here.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {ordered.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 px-4 py-2.5 font-mono text-xs">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", SEVERITY_DOT[ev.severity])} />
                <span className="shrink-0 text-slate-500">{formatTime(ev.ts)}</span>
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-slate-400">
                  {SURFACE_LABEL[ev.surface]}
                </span>
                <span className="flex-1 text-slate-300">
                  {ev.label}
                  {ev.detail && <span className="block text-slate-500">{ev.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

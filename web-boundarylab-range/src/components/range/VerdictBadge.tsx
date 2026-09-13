import { CheckCircle2, ShieldAlert, ShieldX, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/types";

const CONFIG: Record<Verdict, { label: string; icon: typeof CheckCircle2; className: string }> = {
  genuine: {
    label: "Genuine camera",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  suspicious: {
    label: "Suspicious",
    icon: ShieldAlert,
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  spoofed: {
    label: "Spoofed / injected",
    icon: ShieldX,
    className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  pending: {
    label: "Awaiting signal",
    icon: CircleDashed,
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
};

export function VerdictBadge({ verdict, score, className }: { verdict: Verdict; score?: number; className?: string }) {
  const cfg = CONFIG[verdict];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
        cfg.className,
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{cfg.label}</span>
      {typeof score === "number" && <span className="opacity-70">· {score}</span>}
    </div>
  );
}

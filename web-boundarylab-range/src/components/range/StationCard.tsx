import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

interface StationCardProps {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tag: string;
  accent: "indigo" | "violet" | "emerald" | "amber";
}

const ACCENT: Record<StationCardProps["accent"], string> = {
  indigo: "from-indigo-500/20 to-indigo-500/0 text-indigo-300 border-indigo-500/20",
  violet: "from-violet-500/20 to-violet-500/0 text-violet-300 border-violet-500/20",
  emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-300 border-emerald-500/20",
  amber: "from-amber-500/20 to-amber-500/0 text-amber-300 border-amber-500/20",
};

export function StationCard({ to, icon: Icon, title, description, tag, accent }: StationCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-transform hover:-translate-y-0.5",
        ACCENT[accent],
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-white/5", ACCENT[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
          {tag}
        </span>
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
      </div>
      <div className="mt-auto flex items-center gap-1.5 text-sm font-medium text-slate-300">
        Open station
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

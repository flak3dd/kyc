import { forwardRef } from "react";
import { Camera, Gauge, Timer, Waves } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StreamSignals } from "@/lib/types";

interface CameraStageProps {
  active: boolean;
  signals: StreamSignals;
  label?: string;
  className?: string;
}

function StatChip({ icon: Icon, label, value, warn }: { icon: typeof Camera; label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[11px] backdrop-blur">
      <Icon className={cn("h-3.5 w-3.5", warn ? "text-amber-400" : "text-slate-400")} />
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-semibold", warn ? "text-amber-300" : "text-slate-200")}>{value}</span>
    </div>
  );
}

export const CameraStage = forwardRef<HTMLVideoElement, CameraStageProps>(function CameraStage(
  { active, signals, label, className },
  ref,
) {
  return (
    <div className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-slate-950 ring-1 ring-white/10", className)}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={cn("h-full w-full object-cover transition-opacity", active ? "opacity-100" : "opacity-0")}
      />
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600">
          <Camera className="h-10 w-10" />
          <p className="text-sm">No active stream</p>
        </div>
      )}
      {label && (
        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur">
          {label}
        </div>
      )}
      {active && (
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
          <StatChip icon={Gauge} label="fps" value={signals.fps.toFixed(1)} warn={signals.fps < 15} />
          <StatChip icon={Timer} label="frozen" value={`${signals.frozenMs}ms`} warn={signals.frozenMs > 300} />
          <StatChip icon={Waves} label="var" value={signals.variance.toFixed(1)} warn={signals.variance < 0.4} />
        </div>
      )}
    </div>
  );
});

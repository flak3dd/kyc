import { Fingerprint, MonitorPlay, ScanFace, TerminalSquare, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { StationCard } from "@/components/range/StationCard";
import { rangeStore, useRangeState } from "@/lib/rangeStore";

const Index = () => {
  const { events, sessionLabel } = useRangeState();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_-10%,#3730a3_0%,transparent_45%),radial-gradient(circle_at_100%_10%,#6d28d9_0%,transparent_40%),#05060f] text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <header className="mb-12 flex flex-col gap-4">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-indigo-400">
            <TerminalSquare className="h-4 w-4" />
            BoundaryLab Range
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            A controlled target for testing media interception
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-400">
            This site simulates a real identity-verification provider — document capture, live camera
            checks, and a cross-origin liveness widget — with an anti-spoof engine that scores whatever
            stream reaches it. Run BoundaryLab against it to see, from the target's point of view, whether
            your interception holds up. Authorized lab use only.
          </p>
          {sessionLabel && (
            <p className="font-mono text-xs text-emerald-400">
              Active session: {sessionLabel}
            </p>
          )}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <StationCard
            to="/verify"
            icon={ScanFace}
            title="Verification flow"
            description="The primary target — a mock ID check with document upload, main-frame liveness, and an embedded cross-origin liveness widget."
            tag="target"
            accent="indigo"
          />
          <StationCard
            to="/verify/liveness-widget"
            icon={ScanFace}
            title="Liveness widget (standalone)"
            description="Open the cross-origin-style liveness widget on its own, isolated from the rest of the flow — useful for testing iframe GUM in isolation."
            tag="INJ-05"
            accent="violet"
          />
          <StationCard
            to="/probes/display"
            icon={MonitorPlay}
            title="Screen capture probe"
            description="Exercises getDisplayMedia directly so you can confirm display-to-camera redirection behaves and constraints are cleaned."
            tag="INJ-06"
            accent="emerald"
          />
          <StationCard
            to="/probes/fingerprint"
            icon={Fingerprint}
            title="Fingerprint inspector"
            description="Reads navigator, WebGL, and device-enumeration fingerprints exactly like a KYC SDK would, and flags anything that looks spoofed."
            tag="fingerprint"
            accent="amber"
          />
        </div>

        <div className="mt-10 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <p className="text-sm font-medium text-slate-200">Operator console</p>
            <p className="text-xs text-slate-500">
              Watch every capture surface report in real time — {events.length} events logged this session.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => rangeStore.reset()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset session
            </button>
            <Link
              to="/console"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            >
              Open console
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;

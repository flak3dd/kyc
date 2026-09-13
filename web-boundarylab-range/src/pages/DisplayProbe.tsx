import { useRef, useState } from "react";
import { ArrowLeft, Loader2, MonitorPlay, MonitorX } from "lucide-react";
import { Link } from "react-router-dom";

import { CameraStage } from "@/components/range/CameraStage";
import { readTrackSignals, StreamMonitor } from "@/lib/detection";
import { rangeStore } from "@/lib/rangeStore";
import type { StreamSignals } from "@/lib/types";
import { emptySignals } from "@/lib/types";

/**
 * Exercises `getDisplayMedia` directly (INJ-06 target). A common
 * interception pattern redirects `getDisplayMedia` calls to a fake camera
 * stream — this probe lets you confirm the redirected stream still reports
 * clean settings (no leftover `displaySurface` constraint artifacts) and
 * behaves like a real capture.
 */
const DisplayProbe = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const monitorRef = useRef<StreamMonitor | null>(null);
  const [signals, setSignals] = useState<StreamSignals>(emptySignals());
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const start = async () => {
    setRequesting(true);
    setError(null);
    const t0 = performance.now();
    try {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream>;
      };
      if (!md.getDisplayMedia) throw new Error("getDisplayMedia is not available in this browser context");

      const stream = await md.getDisplayMedia({ video: { displaySurface: "monitor" } as MediaTrackConstraints });
      const resolveMs = Math.round(performance.now() - t0);
      const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      const leaked = "displaySurface" in settings;

      rangeStore.log(
        "display",
        leaked ? "warn" : "pass",
        "getDisplayMedia resolved",
        `${resolveMs}ms — displaySurface in reported settings: ${leaked ? "yes (leak)" : "no"}`,
      );

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const monitor = new StreamMonitor(videoRef.current);
        monitor.setGumResolveMs(resolveMs);
        monitor.onUpdate = (s) => setSignals({ ...s, ...readTrackSignals(stream) });
        monitor.start();
        monitorRef.current = monitor;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown getDisplayMedia error";
      setError(message);
      rangeStore.log("display", "fail", "getDisplayMedia rejected", message);
    } finally {
      setRequesting(false);
    }
  };

  const stop = () => {
    monitorRef.current?.stop();
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setSignals(emptySignals());
  };

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100">
      <div className="mx-auto max-w-md px-6 py-10">
        <Link to="/" className="mb-8 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Range
        </Link>
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
            <MonitorPlay className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Screen capture probe</h1>
            <p className="text-xs font-mono uppercase tracking-wider text-emerald-500/70">INJ-06</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Calls <code className="rounded bg-white/10 px-1 py-0.5 text-xs">getDisplayMedia</code> with a{" "}
          <code className="rounded bg-white/10 px-1 py-0.5 text-xs">displaySurface: monitor</code> constraint.
          If your interception redirects this to a camera stream, the resulting settings should never echo
          display-only constraints back — that's a tell.
        </p>

        <CameraStage ref={videoRef} active={signals.active} signals={signals} label="Display media" />
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          {!signals.active ? (
            <button
              onClick={start}
              disabled={requesting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
            >
              {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
              Request display media
            </button>
          ) : (
            <button
              onClick={stop}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              <MonitorX className="h-4 w-4" />
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DisplayProbe;

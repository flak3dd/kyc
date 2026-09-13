import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { CameraStage } from "@/components/range/CameraStage";
import { buildRangeReport, readTrackSignals, StreamMonitor } from "@/lib/detection";
import { rangeStore } from "@/lib/rangeStore";
import type { StreamSignals } from "@/lib/types";
import { emptySignals } from "@/lib/types";

type Challenge = "center" | "smile" | "turn-left" | "turn-right" | "done";

const CHALLENGE_COPY: Record<Challenge, string> = {
  center: "Look straight at the camera",
  smile: "Now smile",
  "turn-left": "Slowly turn your head left",
  "turn-right": "Slowly turn your head right",
  done: "Liveness challenge complete",
};

const SEQUENCE: Challenge[] = ["center", "smile", "turn-left", "turn-right", "done"];
const STEP_MS = 2200;

/**
 * A liveness widget rendered in its own frame, mirroring the pattern real KYC
 * providers use (Sumsub, etc.): a challenge-response GUM flow embedded via
 * iframe with its own script realm. Runs independently or embedded in
 * `/verify` — reports completion to the parent via `postMessage`.
 */
const LivenessWidget = () => {
  const [params] = useSearchParams();
  const embedded = params.get("embedded") === "1";
  const videoRef = useRef<HTMLVideoElement>(null);
  const monitorRef = useRef<StreamMonitor | null>(null);
  const signalsRef = useRef<StreamSignals>(emptySignals());
  const sequenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [signals, setSignals] = useState<StreamSignals>(emptySignals());
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopStream = () => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (sequenceTimerRef.current) {
      clearInterval(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  };

  const finish = () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = setTimeout(() => {
      finishTimerRef.current = null;
      const finalSignals = signalsRef.current.active ? signalsRef.current : emptySignals();
      const report = buildRangeReport(finalSignals, []);
      rangeStore.setReport(report);
      rangeStore.log(
        "gum-iframe",
        report.verdict === "spoofed" ? "fail" : "pass",
        "Liveness widget verdict",
        `${report.verdict} (${report.score})`,
      );
      // Same-origin embed under /verify — target parent origin, not "*".
      const target = window.location.origin;
      window.parent.postMessage(
        { source: "boundarylab-liveness-widget", type: "widget-complete", challenge: "turn-left/right + smile" },
        target,
      );
    }, 400);
  };

  const runSequence = () => {
    let i = 0;
    setChallenge(SEQUENCE[0]);
    if (sequenceTimerRef.current) clearInterval(sequenceTimerRef.current);
    sequenceTimerRef.current = setInterval(() => {
      i += 1;
      if (i >= SEQUENCE.length) {
        if (sequenceTimerRef.current) clearInterval(sequenceTimerRef.current);
        sequenceTimerRef.current = null;
        setChallenge("done");
        finish();
        return;
      }
      setChallenge(SEQUENCE[i]);
    }, STEP_MS);
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    const t0 = performance.now();
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
        audio: false,
      });
      const resolveMs = Math.round(performance.now() - t0);
      rangeStore.log(
        "gum-iframe",
        "info",
        "getUserMedia resolved (iframe realm)",
        `${resolveMs}ms — origin realm: ${window.location.pathname}`,
      );

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const monitor = new StreamMonitor(videoRef.current);
        monitor.setGumResolveMs(resolveMs);
        monitor.onUpdate = (s) => {
          const merged = { ...s, ...readTrackSignals(stream) };
          signalsRef.current = merged;
          setSignals(merged);
        };
        monitor.start();
        monitorRef.current = monitor;
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }

      navigator.mediaDevices
        .enumerateDevices?.()
        .then((devices) => rangeStore.log("enumerate", "info", `Iframe enumerateDevices → ${devices.length} device(s)`))
        .catch(() => undefined);

      runSequence();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown getUserMedia error";
      setError(message);
      rangeStore.log("gum-iframe", "fail", "Iframe getUserMedia rejected", message);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    return () => stopStream();
  }, []);

  return (
    <div className={embedded ? "flex h-full flex-col items-center justify-center gap-4 bg-black p-4" : "flex min-h-screen flex-col items-center justify-center gap-5 bg-[#05060f] p-6 text-slate-100"}>
      {!embedded && (
        <div className="mb-2 text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-violet-400">Isolated frame realm</p>
          <h1 className="mt-1 text-lg font-semibold text-white">Liveness widget</h1>
        </div>
      )}
      <CameraStage ref={videoRef} active={signals.active} signals={signals} className="max-w-xs" />
      {error && <p className="max-w-xs text-center text-xs text-rose-400">{error}</p>}

      {!signals.active ? (
        <button
          onClick={start}
          disabled={starting}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-60"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Begin challenge
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200">
          {challenge === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Loader2 className="h-4 w-4 animate-spin text-violet-400" />}
          {challenge ? CHALLENGE_COPY[challenge] : "Preparing…"}
        </div>
      )}
    </div>
  );
};

export default LivenessWidget;

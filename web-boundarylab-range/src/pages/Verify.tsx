import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, FileImage, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { CameraStage } from "@/components/range/CameraStage";
import { VerdictBadge } from "@/components/range/VerdictBadge";
import { buildRangeReport, readTrackSignals, StreamMonitor } from "@/lib/detection";
import { rangeStore, useRangeState } from "@/lib/rangeStore";
import type { StreamSignals } from "@/lib/types";
import { emptySignals } from "@/lib/types";

type Step = "welcome" | "doc-front" | "doc-back" | "liveness" | "widget" | "result";

const STEP_ORDER: Step[] = ["welcome", "doc-front", "doc-back", "liveness", "widget", "result"];
const STEP_TITLE: Record<Step, string> = {
  welcome: "Consent",
  "doc-front": "ID front",
  "doc-back": "ID back",
  liveness: "Liveness",
  widget: "Liveness widget",
  result: "Result",
};

function DocumentUpload({
  title,
  onCaptured,
}: {
  title: string;
  onCaptured: (file: File, preview: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Local preview only — parent owns the handoff URL for the result step and revokes it.
  const localPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const start = performance.now();
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    // Parent receives its own blob URL so unmount of this step does not revoke result thumbs.
    const parentUrl = URL.createObjectURL(file);
    const localUrl = URL.createObjectURL(file);
    localPreviewRef.current = localUrl;
    setPreview(localUrl);
    const elapsed = Math.round(performance.now() - start);
    rangeStore.log(
      "file-chooser",
      "info",
      `${title} received via file chooser`,
      `${file.type || "unknown type"}, ${(file.size / 1024).toFixed(0)}KB, resolved in ${elapsed}ms`,
    );
    onCaptured(file, parentUrl);
  };

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex h-56 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.03]">
        {preview ? (
          <img src={preview} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <FileImage className="h-8 w-8" />
            <span className="text-sm">No image selected</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
      >
        <Upload className="h-4 w-4" />
        {preview ? "Replace image" : `Capture ${title.toLowerCase()}`}
      </button>
    </div>
  );
}

function LivenessStation({ onSignals }: { onSignals: (s: StreamSignals) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const monitorRef = useRef<StreamMonitor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [signals, setSignals] = useState<StreamSignals>(emptySignals());
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const releaseCamera = useCallback(() => {
    monitorRef.current?.stop();
    monitorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setRequesting(true);
    setError(null);
    const t0 = performance.now();
    try {
      releaseCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      const resolveMs = Math.round(performance.now() - t0);
      rangeStore.log("gum-main", "info", "getUserMedia resolved (main frame)", `${resolveMs}ms to acquire stream`);

      if (videoRef.current) {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        const monitor = new StreamMonitor(videoRef.current);
        monitor.setGumResolveMs(resolveMs);
        monitor.onUpdate = (s) => {
          const merged = { ...s, ...readTrackSignals(stream) };
          setSignals(merged);
          onSignals(merged);
          rangeStore.setSignals(merged);
        };
        monitor.start();
        monitorRef.current = monitor;
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown getUserMedia error";
      setError(message);
      rangeStore.log("gum-main", "fail", "getUserMedia rejected", message);
    } finally {
      setRequesting(false);
    }
  }, [onSignals, releaseCamera]);

  useEffect(() => {
    return () => releaseCamera();
  }, [releaseCamera]);

  return (
    <div className="flex flex-col items-center gap-5">
      <CameraStage ref={videoRef} active={signals.active} signals={signals} label="Main-frame GUM" className="max-w-sm" />
      {error && <p className="max-w-sm text-center text-sm text-rose-400">{error}</p>}
      {!signals.active && (
        <button
          onClick={start}
          disabled={requesting}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-60"
        >
          {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Start liveness check
        </button>
      )}
      {signals.active && (
        <p className="max-w-sm text-center text-xs text-slate-500">
          Keep your face centered. Metrics update live — the operator console mirrors this in real time.
        </p>
      )}
    </div>
  );
}

const Verify = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [docFront, setDocFront] = useState<string | null>(null);
  const [docBack, setDocBack] = useState<string | null>(null);
  const [signals, setSignals] = useState<StreamSignals>(emptySignals());
  const { events, report } = useRangeState();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [widgetDone, setWidgetDone] = useState(false);
  const docFrontRef = useRef<string | null>(null);
  const docBackRef = useRef<string | null>(null);

  useEffect(() => {
    rangeStore.startSession(`Verdix Range ID Check — ${new Date().toLocaleTimeString()}`);
    return () => {
      if (docFrontRef.current) URL.revokeObjectURL(docFrontRef.current);
      if (docBackRef.current) URL.revokeObjectURL(docBackRef.current);
    };
  }, []);

  useEffect(() => {
    if (step !== "widget") return;
    function onMessage(ev: MessageEvent) {
      if (ev.data?.source !== "boundarylab-liveness-widget") return;
      if (ev.data.type === "widget-complete") {
        setWidgetDone(true);
        rangeStore.log("gum-iframe", "pass", "Liveness widget completed", `Challenge: ${ev.data.challenge ?? "n/a"}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [step]);

  useEffect(() => {
    if (step !== "result") return;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((devices) => {
        rangeStore.log("enumerate", "info", `enumerateDevices returned ${devices.length} device(s)`);
        const finalReport = buildRangeReport(signals, devices);
        rangeStore.setReport(finalReport);
      })
      .catch(() => {
        const finalReport = buildRangeReport(signals, []);
        rangeStore.setReport(finalReport);
      });
  }, [step, signals]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const goNext = () => setStep(STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)]);

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-4 w-4" />
            Range
          </Link>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            Verdix Range ID Check
          </div>
          <Link to="/console" className="text-xs font-mono text-slate-600 hover:text-slate-400">
            {events.length} evt
          </Link>
        </header>

        <div className="mb-8 flex items-center gap-1.5">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-indigo-400" : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <p className="mb-6 font-mono text-[11px] uppercase tracking-wider text-slate-500">
          Step {stepIndex + 1} of {STEP_ORDER.length} · {STEP_TITLE[step]}
        </p>

        <div className="flex flex-1 flex-col justify-center">
          {step === "welcome" && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15">
                <ShieldCheck className="h-8 w-8 text-indigo-400" />
              </div>
              <h1 className="text-xl font-semibold text-white">Identity verification</h1>
              <p className="max-w-sm text-sm leading-relaxed text-slate-400">
                This is a simulated verification provider built for authorized security testing. It runs the
                same capture surfaces as a real KYC SDK — document capture, live camera checks, and a
                liveness widget in an isolated frame — and scores the stream it receives.
              </p>
              <button
                onClick={goNext}
                className="rounded-xl bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
              >
                Start verification
              </button>
            </div>
          )}

          {step === "doc-front" && (
            <DocumentUpload
              title="ID front"
              onCaptured={(_f, preview) => {
                if (docFrontRef.current) URL.revokeObjectURL(docFrontRef.current);
                docFrontRef.current = preview;
                setDocFront(preview);
                goNext();
              }}
            />
          )}

          {step === "doc-back" && (
            <DocumentUpload
              title="ID back"
              onCaptured={(_f, preview) => {
                if (docBackRef.current) URL.revokeObjectURL(docBackRef.current);
                docBackRef.current = preview;
                setDocBack(preview);
                goNext();
              }}
            />
          )}

          {step === "liveness" && (
            <div className="flex flex-col items-center gap-6">
              <LivenessStation onSignals={setSignals} />
              {signals.active && (
                <button
                  onClick={goNext}
                  className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                >
                  Continue
                </button>
              )}
            </div>
          )}

          {step === "widget" && (
            <div className="flex flex-col items-center gap-5">
              <p className="max-w-sm text-center text-sm text-slate-400">
                This liveness widget runs in its own frame — the pattern real KYC providers (Sumsub-style)
                use for a cross-origin liveness challenge.
              </p>
              <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black">
                <iframe
                  ref={iframeRef}
                  src="/verify/liveness-widget?embedded=1"
                  title="Liveness widget"
                  allow="camera; microphone"
                  className="aspect-[3/4] w-full"
                />
              </div>
              {widgetDone && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Widget reported completion
                </div>
              )}
              <button
                onClick={goNext}
                disabled={!widgetDone}
                className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Finish verification
              </button>
            </div>
          )}

          {step === "result" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex gap-3">
                {docFront && <img src={docFront} className="h-20 w-16 rounded-lg object-cover ring-1 ring-white/10" alt="front" />}
                {docBack && <img src={docBack} className="h-20 w-16 rounded-lg object-cover ring-1 ring-white/10" alt="back" />}
              </div>
              {report ? (
                <>
                  <VerdictBadge verdict={report.verdict} score={report.score} />
                  <div className="w-full max-w-sm space-y-2 text-left">
                    {report.checks.map((c) => (
                      <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-xs font-medium text-slate-200">{c.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{c.detail}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              )}
              <button
                onClick={() => navigate("/console")}
                className="rounded-xl border border-white/15 px-6 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
              >
                View full telemetry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Verify;

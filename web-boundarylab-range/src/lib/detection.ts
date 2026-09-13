/**
 * Client-side anti-spoof detection engine for the BoundaryLab Range.
 *
 * This runs entirely inside the target page (the mock KYC provider), exactly
 * where a real verification SDK's liveness/anti-spoof layer would run. It
 * measures the live `MediaStream` the browser handed to the page and scores
 * how "genuine camera" it looks — the same signals an interception layer is
 * trying to defeat.
 */
import type { RangeCheck, StreamSignals, RangeReport, Verdict } from "./types";
import { emptySignals } from "./types";

const SAMPLE_SIZE = 24; // downscaled sample square for hashing/variance
const FROZEN_THRESHOLD_MS = 300;

/** Declares the non-standard but widely supported rVFC callback API. */
type VideoFrameCallbackHost = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class StreamMonitor {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private rvfcHandle = 0;
  private running = false;

  private frameTimestamps: number[] = [];
  private lastSample: Uint8ClampedArray | null = null;
  private lastChangeAt = 0;
  private frozenMs = 0;
  private varianceSum = 0;
  private varianceSamples = 0;
  private frameCount = 0;

  private gumResolveMs: number | null = null;
  private startedAt = performance.now();

  onUpdate: ((signals: StreamSignals) => void) | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.canvas.width = SAMPLE_SIZE;
    this.canvas.height = SAMPLE_SIZE;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  setGumResolveMs(ms: number) {
    this.gumResolveMs = ms;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastChangeAt = performance.now();
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    const host = this.video as VideoFrameCallbackHost;
    if (this.rvfcHandle && host.cancelVideoFrameCallback) {
      host.cancelVideoFrameCallback(this.rvfcHandle);
    }
  }

  private tick = () => {
    if (!this.running) return;
    this.sampleFrame();

    const host = this.video as VideoFrameCallbackHost;
    if (typeof host.requestVideoFrameCallback === "function") {
      this.rvfcHandle = host.requestVideoFrameCallback(this.tick);
    } else {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private sampleFrame() {
    if (!this.ctx || this.video.readyState < 2) return;
    const now = performance.now();

    try {
      this.ctx.drawImage(this.video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = this.ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

      if (this.lastSample) {
        let delta = 0;
        for (let i = 0; i < data.length; i += 4) {
          delta += Math.abs(data[i] - this.lastSample[i]);
        }
        const meanDelta = delta / (data.length / 4);
        this.varianceSum += meanDelta;
        this.varianceSamples += 1;

        if (meanDelta > 1.5) {
          this.lastChangeAt = now;
        }
      }

      this.lastSample = data;
      this.frameCount += 1;
      this.frameTimestamps.push(now);
      // Keep a rolling 2s window for fps calculation.
      const cutoff = now - 2000;
      while (this.frameTimestamps.length && this.frameTimestamps[0] < cutoff) {
        this.frameTimestamps.shift();
      }

      this.frozenMs = Math.max(this.frozenMs, now - this.lastChangeAt);
    } catch {
      // Cross-origin / tainted canvas — ignore this sample.
    }

    this.emit();
  }

  private emit() {
    if (!this.onUpdate) return;
    const elapsedS = Math.max((performance.now() - this.startedAt) / 1000, 0.5);
    const fps = this.frameTimestamps.length > 1 ? this.frameTimestamps.length / 2 : this.frameCount / elapsedS;

    this.onUpdate({
      active: true,
      fps: Math.round(fps * 10) / 10,
      frameCount: this.frameCount,
      frozenMs: Math.round(this.frozenMs),
      variance: this.varianceSamples ? Math.round((this.varianceSum / this.varianceSamples) * 10) / 10 : 0,
      width: this.video.videoWidth,
      height: this.video.videoHeight,
      reportedFrameRate: null,
      deviceId: null,
      facingMode: null,
      label: null,
      hasAudio: false,
      gumResolveMs: this.gumResolveMs,
    });
  }
}

/** Reads live MediaStreamTrack metadata to merge into the running signals. */
export function readTrackSignals(stream: MediaStream): Partial<StreamSignals> {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];
  if (!videoTrack) return {};

  const settings = videoTrack.getSettings?.() ?? {};
  return {
    reportedFrameRate: typeof settings.frameRate === "number" ? Math.round(settings.frameRate * 10) / 10 : null,
    deviceId: settings.deviceId ?? null,
    facingMode: (settings.facingMode as string | undefined) ?? null,
    label: videoTrack.label || null,
    hasAudio: Boolean(audioTrack),
  };
}

/**
 * Scores a genuine-camera confidence report from accumulated stream signals.
 * Mirrors the checklist an anti-spoof / liveness engine would run.
 */
export function buildRangeReport(signals: StreamSignals, devices: MediaDeviceInfo[]): RangeReport {
  const checks: RangeCheck[] = [];

  // 1. Frame continuity — real cameras never freeze past ~300ms except in bad light.
  if (!signals.active) {
    checks.push({ id: "continuity", title: "Frame continuity", status: "info", detail: "Stream not yet active." });
  } else if (signals.frozenMs > FROZEN_THRESHOLD_MS) {
    checks.push({
      id: "continuity",
      title: "Frame continuity",
      status: "fail",
      detail: `Identical frames held for ${signals.frozenMs}ms — exceeds the ${FROZEN_THRESHOLD_MS}ms freeze threshold. Suggests a static image or looping clip.`,
    });
  } else {
    checks.push({
      id: "continuity",
      title: "Frame continuity",
      status: "pass",
      detail: `Longest static stretch was ${signals.frozenMs}ms — within live-camera tolerance.`,
    });
  }

  // 2. Frame rate.
  if (signals.active && signals.fps < 8) {
    checks.push({
      id: "framerate",
      title: "Frame rate",
      status: "fail",
      detail: `Measured ${signals.fps} fps — far below a live camera's typical 24–30 fps.`,
    });
  } else if (signals.active) {
    checks.push({
      id: "framerate",
      title: "Frame rate",
      status: signals.fps < 15 ? "warn" : "pass",
      detail: `Measured ${signals.fps} fps from ${signals.frameCount} sampled frames.`,
    });
  } else {
    checks.push({ id: "framerate", title: "Frame rate", status: "info", detail: "Awaiting stream." });
  }

  // 3. Pixel variance — synthetic loops often have unnaturally low or perfectly periodic variance.
  if (signals.active && signals.variance < 0.4) {
    checks.push({
      id: "variance",
      title: "Motion variance",
      status: "warn",
      detail: `Mean inter-frame pixel delta ${signals.variance} — unusually still. Real faces show micro-motion (breathing, blinking).`,
    });
  } else if (signals.active) {
    checks.push({
      id: "variance",
      title: "Motion variance",
      status: "pass",
      detail: `Mean inter-frame pixel delta ${signals.variance} — natural micro-motion detected.`,
    });
  } else {
    checks.push({ id: "variance", title: "Motion variance", status: "info", detail: "Awaiting stream." });
  }

  // 4. Track settings sanity — missing deviceId is a common injected-stream tell.
  if (signals.active && !signals.deviceId) {
    checks.push({
      id: "track",
      title: "Track identity",
      status: "warn",
      detail: "Video track reports no deviceId — real camera tracks normally expose one.",
    });
  } else if (signals.active) {
    checks.push({
      id: "track",
      title: "Track identity",
      status: "pass",
      detail: `Track bound to device ${signals.deviceId?.slice(0, 12)}… (${signals.facingMode ?? "facing mode unknown"}).`,
    });
  } else {
    checks.push({ id: "track", title: "Track identity", status: "info", detail: "Awaiting stream." });
  }

  // 5. GUM resolve timing — instant resolution (<15ms) can indicate a pre-baked stream.
  if (signals.gumResolveMs !== null) {
    checks.push({
      id: "timing",
      title: "Acquisition latency",
      status: signals.gumResolveMs < 15 ? "warn" : "pass",
      detail:
        signals.gumResolveMs < 15
          ? `getUserMedia resolved in ${signals.gumResolveMs}ms — near-instant, faster than typical hardware arbitration.`
          : `getUserMedia resolved in ${signals.gumResolveMs}ms — consistent with real camera/permission negotiation.`,
    });
  }

  // 6. Device enumeration sanity.
  if (devices.length > 0) {
    const suspicious = devices.filter((d) => !d.deviceId || d.label.trim() === "");
    checks.push({
      id: "devices",
      title: "Device enumeration",
      status: suspicious.length > 0 ? "warn" : "pass",
      detail:
        suspicious.length > 0
          ? `${suspicious.length} of ${devices.length} reported devices have empty deviceId/label.`
          : `${devices.length} devices enumerated with populated deviceId/label pairs.`,
    });
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const passCount = checks.filter((c) => c.status === "pass").length;

  let score = 100;
  score -= failCount * 35;
  score -= warnCount * 12;
  score = Math.max(0, Math.min(100, score));

  let verdict: Verdict = "pending";
  if (!signals.active && passCount === 0 && failCount === 0) verdict = "pending";
  else if (failCount > 0) verdict = "spoofed";
  else if (warnCount > 1) verdict = "suspicious";
  else verdict = "genuine";

  return { verdict, score, checks, updatedAt: Date.now() };
}

export { emptySignals };

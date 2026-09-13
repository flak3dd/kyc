/** Shared types for the BoundaryLab Range test-target harness. */

export type Verdict = "genuine" | "suspicious" | "spoofed" | "pending";

export type Severity = "info" | "pass" | "warn" | "fail";

export type Surface =
  | "gum-main" // getUserMedia in the main frame (INJ-04)
  | "gum-iframe" // getUserMedia in a cross-origin iframe (INJ-05, Sumsub-style)
  | "file-chooser" // <input type=file capture> document upload (INJ-10)
  | "enumerate" // navigator.mediaDevices.enumerateDevices
  | "display" // getDisplayMedia
  | "fingerprint"; // navigator / WebGL / UA fingerprinting

/** A single telemetry line emitted by the target harness. */
export interface TelemetryEvent {
  id: string;
  ts: number;
  surface: Surface;
  severity: Severity;
  label: string;
  detail?: string;
}

/** Live metrics computed on the active camera stream. */
export interface StreamSignals {
  active: boolean;
  fps: number;
  frameCount: number;
  frozenMs: number; // longest stretch with identical frames
  variance: number; // mean inter-frame pixel delta (0..255)
  width: number;
  height: number;
  reportedFrameRate: number | null; // track.getSettings().frameRate
  deviceId: string | null;
  facingMode: string | null;
  label: string | null;
  hasAudio: boolean;
  gumResolveMs: number | null; // how long getUserMedia took to resolve
}

/** A named anti-spoof check with a pass/warn/fail outcome. */
export interface RangeCheck {
  id: string;
  title: string;
  status: Severity;
  detail: string;
}

export interface RangeReport {
  verdict: Verdict;
  score: number; // 0..100 confidence the stream is a genuine live camera
  checks: RangeCheck[];
  updatedAt: number;
}

export function emptySignals(): StreamSignals {
  return {
    active: false,
    fps: 0,
    frameCount: 0,
    frozenMs: 0,
    variance: 0,
    width: 0,
    height: 0,
    reportedFrameRate: null,
    deviceId: null,
    facingMode: null,
    label: null,
    hasAudio: false,
    gumResolveMs: null,
  };
}

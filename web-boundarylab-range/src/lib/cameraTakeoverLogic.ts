/**
 * Pure decision logic for camera feed intercept / takeover.
 *
 * Mirrors the Android Lab Host contracts so unit tests can prove routing
 * without a device WebView:
 * - BrowserHostConfig readiness (KYC arm)
 * - CaptureInterceptResolver (file-chooser / INJ-10)
 * - Facing inject payload selection (INJ-04 + injectMode)
 *
 * Keep in sync with:
 * - android …/BrowserHostConfig.kt
 * - android …/CaptureInterceptResolver.kt
 * - android …/TechniqueInjectionScripts.kt (facingRoutingScript)
 */

export type CameraPolicy = "ALLOW" | "SUBSTITUTE" | "DENY";
export type InjectMode = "PASSIVE_FIRST" | "CONTINUOUS_DEFAULT" | "ACTIVE_ADVANCED";
export type MediaUploadMode =
  | "SYSTEM_CHOOSER"
  | "GALLERY"
  | "CAMERA"
  | "LAB_SYNTHETIC"
  | "USER_DEFINED"
  | "MEDIA_SEQUENCE"
  | "USER_PICK"
  | "CANCEL";

export interface HostConfigLike {
  cameraTakeoverEnabled: boolean;
  cameraInterceptPolicy: CameraPolicy;
  cameraTakeoverMode: MediaUploadMode;
  mediaUploadEnabled: boolean;
  mediaUploadMode: MediaUploadMode;
  injectMode: InjectMode;
  silentFrontEnabled: boolean;
  preferHtmlVideo: boolean;
  mediaSequence: string[];
  mediaSeqIndex: number;
  silentFrontPassiveUrl: string | null;
  silentFrontLivenessUrl: string | null;
  mediaSeedEmpty: boolean;
}

/** Baseline arm profile (TakeoverInjectionBaseline). */
export function baselineHostConfig(overrides: Partial<HostConfigLike> = {}): HostConfigLike {
  return {
    cameraTakeoverEnabled: true,
    cameraInterceptPolicy: "SUBSTITUTE",
    cameraTakeoverMode: "USER_PICK",
    mediaUploadEnabled: true,
    mediaUploadMode: "USER_PICK",
    injectMode: "CONTINUOUS_DEFAULT",
    silentFrontEnabled: true,
    preferHtmlVideo: true,
    mediaSequence: [],
    mediaSeqIndex: 0,
    silentFrontPassiveUrl: null,
    silentFrontLivenessUrl: null,
    mediaSeedEmpty: true,
    ...overrides,
  };
}

export function missingForKyc(config: HostConfigLike): string[] {
  const missing: string[] = [];
  if (!config.cameraTakeoverEnabled) missing.push("Camera takeover disabled");
  if (config.cameraInterceptPolicy !== "SUBSTITUTE") missing.push("Policy not SUBSTITUTE");
  if (config.mediaSeedEmpty) missing.push("Media seed empty");
  if (!config.silentFrontPassiveUrl) missing.push("Silent front passive still missing");
  if (!config.silentFrontLivenessUrl) missing.push("Silent front liveness video missing");
  return missing;
}

export function isKycReady(config: HostConfigLike): boolean {
  return missingForKyc(config).length === 0;
}

/**
 * Whether GUM should return a synthetic stream instead of the real camera.
 * Matches wrapGUM in TechniqueInjectionScripts.
 */
export function shouldSubstituteGum(config: HostConfigLike): boolean {
  return config.cameraTakeoverEnabled && config.cameraInterceptPolicy === "SUBSTITUTE";
}

export function shouldDenyGum(config: HostConfigLike): boolean {
  return config.cameraTakeoverEnabled && config.cameraInterceptPolicy === "DENY";
}

export type FrontPayload = {
  preferMaster: "liveness" | "passive" | "none";
  createMode: "video" | "image" | "canvas";
  url: string | null;
};

/**
 * Front-facing payload selection under SUBSTITUTE.
 * Continuous modes MUST prefer liveness video so anti-spoof does not see a freeze.
 */
export function selectFrontPayload(
  config: HostConfigLike,
  masters: { passive: boolean; liveness: boolean },
): FrontPayload {
  const preferContinuous =
    config.injectMode === "CONTINUOUS_DEFAULT" || config.injectMode === "ACTIVE_ADVANCED";

  if (preferContinuous && config.silentFrontEnabled && masters.liveness) {
    return { preferMaster: "liveness", createMode: "video", url: config.silentFrontLivenessUrl };
  }
  if (config.silentFrontEnabled && masters.passive && !preferContinuous) {
    return { preferMaster: "passive", createMode: "image", url: config.silentFrontPassiveUrl };
  }
  if (preferContinuous && config.silentFrontEnabled && masters.passive && !masters.liveness) {
    return { preferMaster: "passive", createMode: "image", url: config.silentFrontPassiveUrl };
  }

  const frontUrl = preferContinuous
    ? config.silentFrontLivenessUrl || config.silentFrontPassiveUrl
    : config.silentFrontPassiveUrl || config.silentFrontLivenessUrl;

  if (!frontUrl) {
    return { preferMaster: "none", createMode: "canvas", url: null };
  }

  let createMode: FrontPayload["createMode"] = preferContinuous ? "video" : "image";
  if (preferContinuous && frontUrl === config.silentFrontPassiveUrl && !config.silentFrontLivenessUrl) {
    createMode = "image";
  }

  return { preferMaster: "none", createMode, url: frontUrl };
}

export type EnvironmentPayload =
  | { kind: "park" }
  | { kind: "sequence"; url: string; index: number }
  | { kind: "canvas" };

/** Environment / back camera routing under SUBSTITUTE. */
export function selectEnvironmentPayload(
  config: HostConfigLike,
  seqIdx = config.mediaSeqIndex,
): EnvironmentPayload {
  const mode = config.cameraTakeoverMode;
  if (mode === "USER_PICK") return { kind: "park" };

  const seq = config.mediaSequence;
  if ((mode === "MEDIA_SEQUENCE" || mode === "LAB_SYNTHETIC") && seq.length > 0) {
    const index = Math.max(0, Math.min(seqIdx, seq.length - 1));
    const url = seq[index];
    if (url) return { kind: "sequence", url, index };
  }
  return { kind: "canvas" };
}

export interface CaptureIntentLike {
  isCaptureEnabled: boolean;
  acceptContainsImage: boolean;
  acceptContainsVideo: boolean;
  captureAttr: string | null;
}

export type InterceptResolution =
  | { type: "deliver"; mode: MediaUploadMode; sequenceSlot?: number }
  | { type: "park" }
  | { type: "cancel" };

/** Mirrors CaptureInterceptResolver.resolve (INJ-10). */
export function resolveCaptureIntercept(
  intent: CaptureIntentLike,
  config: HostConfigLike,
  sequenceReady = false,
  userLibraryReady = false,
): InterceptResolution {
  const isCapture =
    intent.isCaptureEnabled ||
    intent.captureAttr != null ||
    intent.acceptContainsImage ||
    intent.acceptContainsVideo;

  if (!isCapture) {
    return { type: "deliver", mode: "SYSTEM_CHOOSER" };
  }
  if (!config.mediaUploadEnabled) return { type: "cancel" };
  if (config.cameraInterceptPolicy === "DENY") return { type: "cancel" };

  switch (config.mediaUploadMode) {
    case "SYSTEM_CHOOSER":
      return { type: "deliver", mode: "SYSTEM_CHOOSER" };
    case "GALLERY":
      return { type: "deliver", mode: "GALLERY" };
    case "CAMERA":
      return { type: "deliver", mode: "CAMERA" };
    case "LAB_SYNTHETIC":
      return { type: "deliver", mode: "LAB_SYNTHETIC" };
    case "USER_DEFINED":
      return userLibraryReady ? { type: "deliver", mode: "USER_DEFINED" } : { type: "cancel" };
    case "MEDIA_SEQUENCE":
      if (!sequenceReady) return { type: "cancel" };
      return {
        type: "deliver",
        mode: "MEDIA_SEQUENCE",
        sequenceSlot: Math.max(0, Math.min(config.mediaSeqIndex, Math.max(0, config.mediaSequence.length - 1))),
      };
    case "USER_PICK":
      return { type: "park" };
    case "CANCEL":
      return { type: "cancel" };
    default:
      return { type: "cancel" };
  }
}

export function advanceSequenceIndex(config: HostConfigLike): number {
  if (config.mediaSequence.length === 0) return config.mediaSeqIndex;
  return Math.min(config.mediaSeqIndex + 1, config.mediaSequence.length - 1);
}

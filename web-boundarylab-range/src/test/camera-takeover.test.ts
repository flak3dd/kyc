import { describe, expect, it } from "vitest";

import { buildRangeReport } from "@/lib/detection";
import {
  advanceSequenceIndex,
  baselineHostConfig,
  isKycReady,
  missingForKyc,
  resolveCaptureIntercept,
  selectEnvironmentPayload,
  selectFrontPayload,
  shouldDenyGum,
  shouldSubstituteGum,
} from "@/lib/cameraTakeoverLogic";
import { emptySignals, type StreamSignals } from "@/lib/types";

describe("camera takeover arm readiness", () => {
  it("baseline without media is not KYC-ready", () => {
    const cfg = baselineHostConfig();
    expect(shouldSubstituteGum(cfg)).toBe(true);
    expect(isKycReady(cfg)).toBe(false);
    expect(missingForKyc(cfg)).toEqual(
      expect.arrayContaining([
        "Media seed empty",
        "Silent front passive still missing",
        "Silent front liveness video missing",
      ]),
    );
  });

  it("armed baseline with dual silent-front + seed is KYC-ready", () => {
    const cfg = baselineHostConfig({
      silentFrontPassiveUrl: "https://cdn.assets.edge/silent/passive",
      silentFrontLivenessUrl: "https://cdn.assets.edge/silent/liveness",
      mediaSeedEmpty: false,
      mediaSequence: [
        "https://cdn.assets.edge/seq/1",
        "https://cdn.assets.edge/seq/2",
      ],
    });
    expect(isKycReady(cfg)).toBe(true);
    expect(missingForKyc(cfg)).toEqual([]);
    expect(shouldSubstituteGum(cfg)).toBe(true);
    expect(shouldDenyGum(cfg)).toBe(false);
  });

  it("ALLOW policy does not substitute GUM", () => {
    const cfg = baselineHostConfig({ cameraInterceptPolicy: "ALLOW" });
    expect(shouldSubstituteGum(cfg)).toBe(false);
  });

  it("DENY policy rejects GUM and cancels capture", () => {
    const cfg = baselineHostConfig({ cameraInterceptPolicy: "DENY" });
    expect(shouldDenyGum(cfg)).toBe(true);
    const res = resolveCaptureIntercept(
      { isCaptureEnabled: true, acceptContainsImage: true, acceptContainsVideo: false, captureAttr: "camera" },
      cfg,
      true,
      true,
    );
    expect(res).toEqual({ type: "cancel" });
  });

  it("takeover master switch off disables substitute", () => {
    const cfg = baselineHostConfig({ cameraTakeoverEnabled: false });
    expect(shouldSubstituteGum(cfg)).toBe(false);
  });
});

describe("front-facing inject payload (camera feed takeover)", () => {
  const armed = baselineHostConfig({
    silentFrontPassiveUrl: "https://cdn.assets.edge/silent/passive",
    silentFrontLivenessUrl: "https://cdn.assets.edge/silent/liveness",
    mediaSeedEmpty: false,
    injectMode: "CONTINUOUS_DEFAULT",
  });

  it("CONTINUOUS_DEFAULT prefers liveness video master (not frozen still)", () => {
    const payload = selectFrontPayload(armed, { passive: true, liveness: true });
    expect(payload.preferMaster).toBe("liveness");
    expect(payload.createMode).toBe("video");
    expect(payload.url).toContain("liveness");
  });

  it("PASSIVE_FIRST prefers passive still master", () => {
    const cfg = { ...armed, injectMode: "PASSIVE_FIRST" as const };
    const payload = selectFrontPayload(cfg, { passive: true, liveness: true });
    expect(payload.preferMaster).toBe("passive");
    expect(payload.createMode).toBe("image");
  });

  it("ACTIVE_ADVANCED also prefers continuous liveness", () => {
    const cfg = { ...armed, injectMode: "ACTIVE_ADVANCED" as const };
    const payload = selectFrontPayload(cfg, { passive: true, liveness: true });
    expect(payload.preferMaster).toBe("liveness");
  });

  it("falls back to createStream video URL when masters not ready yet", () => {
    const payload = selectFrontPayload(armed, { passive: false, liveness: false });
    expect(payload.preferMaster).toBe("none");
    expect(payload.createMode).toBe("video");
    expect(payload.url).toBe(armed.silentFrontLivenessUrl);
  });

  it("uses canvas only when no front media URLs exist", () => {
    const cfg = baselineHostConfig({
      silentFrontPassiveUrl: null,
      silentFrontLivenessUrl: null,
      mediaSeedEmpty: false,
    });
    const payload = selectFrontPayload(cfg, { passive: false, liveness: false });
    expect(payload.createMode).toBe("canvas");
    expect(payload.url).toBeNull();
  });
});

describe("environment / back camera + sequence", () => {
  it("USER_PICK parks environment GUM for operator accept", () => {
    const cfg = baselineHostConfig({ cameraTakeoverMode: "USER_PICK" });
    expect(selectEnvironmentPayload(cfg)).toEqual({ kind: "park" });
  });

  it("MEDIA_SEQUENCE delivers current sequence URL", () => {
    const cfg = baselineHostConfig({
      cameraTakeoverMode: "MEDIA_SEQUENCE",
      mediaSequence: ["https://cdn.assets.edge/seq/1", "https://cdn.assets.edge/seq/2"],
      mediaSeqIndex: 0,
      mediaSeedEmpty: false,
    });
    expect(selectEnvironmentPayload(cfg)).toEqual({
      kind: "sequence",
      url: "https://cdn.assets.edge/seq/1",
      index: 0,
    });
    expect(advanceSequenceIndex(cfg)).toBe(1);
    expect(selectEnvironmentPayload({ ...cfg, mediaSeqIndex: 1 })).toEqual({
      kind: "sequence",
      url: "https://cdn.assets.edge/seq/2",
      index: 1,
    });
  });

  it("falls back to synthetic canvas when no sequence under non-park modes", () => {
    const cfg = baselineHostConfig({
      cameraTakeoverMode: "MEDIA_SEQUENCE",
      mediaSequence: [],
    });
    expect(selectEnvironmentPayload(cfg)).toEqual({ kind: "canvas" });
  });
});

describe("file-chooser capture intercept (INJ-10)", () => {
  const imageIntent = {
    isCaptureEnabled: true,
    acceptContainsImage: true,
    acceptContainsVideo: false,
    captureAttr: "environment" as string | null,
  };

  it("parks when mode is USER_PICK (baseline)", () => {
    const cfg = baselineHostConfig({ mediaUploadMode: "USER_PICK" });
    expect(resolveCaptureIntercept(imageIntent, cfg, true, true)).toEqual({ type: "park" });
  });

  it("delivers MEDIA_SEQUENCE slot when sequence ready", () => {
    const cfg = baselineHostConfig({
      mediaUploadMode: "MEDIA_SEQUENCE",
      mediaSequence: ["u0", "u1"],
      mediaSeqIndex: 1,
      mediaSeedEmpty: false,
    });
    expect(resolveCaptureIntercept(imageIntent, cfg, true, false)).toEqual({
      type: "deliver",
      mode: "MEDIA_SEQUENCE",
      sequenceSlot: 1,
    });
  });

  it("cancels MEDIA_SEQUENCE when sequence not ready", () => {
    const cfg = baselineHostConfig({ mediaUploadMode: "MEDIA_SEQUENCE" });
    expect(resolveCaptureIntercept(imageIntent, cfg, false, false)).toEqual({ type: "cancel" });
  });

  it("non-capture accept falls through to system chooser", () => {
    const cfg = baselineHostConfig();
    const res = resolveCaptureIntercept(
      {
        isCaptureEnabled: false,
        acceptContainsImage: false,
        acceptContainsVideo: false,
        captureAttr: null,
      },
      cfg,
    );
    expect(res).toEqual({ type: "deliver", mode: "SYSTEM_CHOOSER" });
  });

  it("disables upload → cancel", () => {
    const cfg = baselineHostConfig({ mediaUploadEnabled: false });
    expect(resolveCaptureIntercept(imageIntent, cfg, true, true)).toEqual({ type: "cancel" });
  });
});

describe("Range anti-spoof reaction to frozen vs live synthetic feeds", () => {
  it("flags a frozen still-like stream as spoofed (bad takeover quality)", () => {
    const frozen: StreamSignals = {
      ...emptySignals(),
      active: true,
      fps: 30,
      frameCount: 60,
      frozenMs: 900,
      variance: 0.1,
      width: 1280,
      height: 720,
      deviceId: "default",
      facingMode: "user",
      gumResolveMs: 5,
    };
    const report = buildRangeReport(frozen, [
      { deviceId: "default", kind: "videoinput", label: "Camera 1, Facing front", groupId: "default" } as MediaDeviceInfo,
    ]);
    expect(report.verdict).toBe("spoofed");
    expect(report.checks.find((c) => c.id === "continuity")?.status).toBe("fail");
  });

  it("scores a continuous micro-motion stream as genuine (good continuous takeover)", () => {
    const live: StreamSignals = {
      ...emptySignals(),
      active: true,
      fps: 28,
      frameCount: 200,
      frozenMs: 40,
      variance: 3.5,
      width: 1280,
      height: 720,
      deviceId: "default",
      facingMode: "user",
      gumResolveMs: 120,
      reportedFrameRate: 30,
      label: "Camera 1, Facing front",
    };
    const report = buildRangeReport(live, [
      { deviceId: "default", kind: "videoinput", label: "Camera 1, Facing front", groupId: "default" } as MediaDeviceInfo,
    ]);
    expect(report.verdict).toBe("genuine");
    expect(report.score).toBeGreaterThanOrEqual(80);
  });
});

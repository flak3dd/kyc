import { describe, expect, it } from "vitest";

import { buildRangeReport } from "@/lib/detection";
import { buildSessionExport } from "@/lib/exportReport";
import { isValidShareId, SHARE_ID_RE } from "@/lib/shareId";
import { emptySignals, type StreamSignals, type TelemetryEvent } from "@/lib/types";

describe("buildRangeReport", () => {
  it("returns pending when the stream is inactive and no checks have fired", () => {
    const report = buildRangeReport(emptySignals(), []);
    expect(report.verdict).toBe("pending");
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it("flags frozen frames as spoofed", () => {
    const signals: StreamSignals = {
      ...emptySignals(),
      active: true,
      fps: 30,
      frameCount: 90,
      frozenMs: 1200,
      variance: 4,
      width: 720,
      height: 960,
      deviceId: "abc123def456",
      facingMode: "user",
      gumResolveMs: 120,
    };
    const report = buildRangeReport(signals, []);
    expect(report.verdict).toBe("spoofed");
    expect(report.checks.find((c) => c.id === "continuity")?.status).toBe("fail");
    expect(report.score).toBeLessThan(70);
  });

  it("scores a healthy live stream as genuine", () => {
    const signals: StreamSignals = {
      ...emptySignals(),
      active: true,
      fps: 28,
      frameCount: 200,
      frozenMs: 40,
      variance: 3.2,
      width: 720,
      height: 960,
      deviceId: "device-id-001",
      facingMode: "user",
      gumResolveMs: 180,
    };
    const devices = [
      { deviceId: "device-id-001", kind: "videoinput", label: "Front Camera", groupId: "g1" } as MediaDeviceInfo,
    ];
    const report = buildRangeReport(signals, devices);
    expect(report.verdict).toBe("genuine");
    expect(report.score).toBe(100);
    expect(report.checks.every((c) => c.status === "pass" || c.status === "info")).toBe(true);
  });

  it("warns on near-instant getUserMedia resolution", () => {
    const signals: StreamSignals = {
      ...emptySignals(),
      active: true,
      fps: 25,
      frameCount: 50,
      frozenMs: 20,
      variance: 2,
      deviceId: "d1",
      gumResolveMs: 5,
    };
    const report = buildRangeReport(signals, []);
    expect(report.checks.find((c) => c.id === "timing")?.status).toBe("warn");
  });
});

describe("buildSessionExport", () => {
  it("aggregates severity counts and timeline offsets", () => {
    const startedAt = 1_000_000;
    const events: TelemetryEvent[] = [
      { id: "1", ts: startedAt + 10, surface: "gum-main", severity: "info", label: "start" },
      { id: "2", ts: startedAt + 50, surface: "file-chooser", severity: "fail", label: "bad", detail: "x" },
      { id: "3", ts: startedAt + 80, surface: "gum-main", severity: "warn", label: "slow" },
    ];
    const exportData = buildSessionExport({
      events,
      signals: emptySignals(),
      report: {
        verdict: "suspicious",
        score: 55,
        checks: [{ id: "c1", title: "t", status: "warn", detail: "d" }],
        updatedAt: startedAt + 100,
      },
      sessionLabel: "Lab Run A",
      sessionStartedAt: startedAt,
    });

    expect(exportData.session.label).toBe("Lab Run A");
    expect(exportData.session.eventCount).toBe(3);
    expect(exportData.summary.failCount).toBe(1);
    expect(exportData.summary.warnCount).toBe(1);
    expect(exportData.summary.bySeverity.info).toBe(1);
    expect(exportData.timeline).toHaveLength(3);
    expect(exportData.timeline[0].tSinceStartMs).toBe(10);
    expect(exportData.timeline[1].detail).toBe("x");
    expect(exportData.verdict.verdict).toBe("suspicious");
    expect(exportData.verdict.score).toBe(55);
  });

  it("handles missing session start without throwing", () => {
    const exportData = buildSessionExport({
      events: [],
      signals: emptySignals(),
      report: null,
      sessionLabel: null,
      sessionStartedAt: null,
    });
    expect(exportData.session.label).toBe("Untitled session");
    expect(exportData.session.startedAt).toBeNull();
    expect(exportData.session.durationMs).toBeNull();
    expect(exportData.verdict.verdict).toBe("pending");
  });
});

describe("share id validation", () => {
  it("accepts 22-char base64url ids and legacy 16-char alnum ids", () => {
    expect(isValidShareId("ABCDEFGHIJKLMNOPQRSTUV")).toBe(true);
    expect(isValidShareId("abcXYZ0123-_ABCDEFGHIj")).toBe(true);
    expect(SHARE_ID_RE.test("a".repeat(22))).toBe(true);
    expect(isValidShareId("Ab12Cd34Ef56Gh78")).toBe(true);
  });

  it("rejects wrong length, charset, and empty values", () => {
    expect(isValidShareId("")).toBe(false);
    expect(isValidShareId("short")).toBe(false);
    expect(isValidShareId("a".repeat(21))).toBe(false);
    expect(isValidShareId("a".repeat(23))).toBe(false);
    expect(isValidShareId("ABCDEFGHIJKLMNOPQRSTU+")).toBe(false);
    expect(isValidShareId("ABCDEFGHIJKLMNOPQRSTU/")).toBe(false);
    expect(isValidShareId("../etc/passwd!!!!!!!!!!")).toBe(false);
  });
});

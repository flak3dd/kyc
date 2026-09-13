/**
 * Cross-tab telemetry store for the BoundaryLab Range.
 *
 * The mock verification flow (`/verify`) runs the actual capture surfaces
 * and emits events here. The operator console (`/console`) subscribes to the
 * same store — including from a different tab/device — via BroadcastChannel
 * so an operator can watch interception attempts land in near-real time.
 */
import { useSyncExternalStore } from "react";

import type { RangeReport, StreamSignals, Surface, Severity, TelemetryEvent } from "./types";
import { emptySignals } from "./types";

const CHANNEL_NAME = "boundarylab-range";
const STORAGE_KEY = "boundarylab-range-events-v1";
const MAX_EVENTS = 200;

interface RangeState {
  events: TelemetryEvent[];
  signals: StreamSignals;
  report: RangeReport | null;
  sessionLabel: string | null;
  sessionStartedAt: number | null;
}

type WireMessage =
  | { type: "event"; payload: TelemetryEvent }
  | { type: "signals"; payload: StreamSignals }
  | { type: "report"; payload: RangeReport }
  | { type: "session-start"; payload: { label: string; ts: number } }
  | { type: "reset" };

function loadPersistedEvents(): TelemetryEvent[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistEvents(events: TelemetryEvent[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage quota or privacy mode — telemetry stays in-memory only.
  }
}

class RangeStore {
  private state: RangeState = {
    events: loadPersistedEvents(),
    signals: emptySignals(),
    report: null,
    sessionLabel: null,
    sessionStartedAt: null,
  };

  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (ev: MessageEvent<WireMessage>) => this.applyRemote(ev.data);
    }
  }

  private applyRemote(msg: WireMessage) {
    switch (msg.type) {
      case "event":
        this.state = { ...this.state, events: [...this.state.events, msg.payload].slice(-MAX_EVENTS) };
        persistEvents(this.state.events);
        break;
      case "signals":
        this.state = { ...this.state, signals: msg.payload };
        break;
      case "report":
        this.state = { ...this.state, report: msg.payload };
        break;
      case "session-start":
        this.state = { ...this.state, sessionLabel: msg.payload.label, sessionStartedAt: msg.payload.ts };
        break;
      case "reset":
        this.state = { events: [], signals: emptySignals(), report: null, sessionLabel: null, sessionStartedAt: null };
        persistEvents([]);
        break;
    }
    this.notify();
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RangeState => this.state;

  private broadcast(msg: WireMessage) {
    this.channel?.postMessage(msg);
  }

  log(surface: Surface, severity: Severity, label: string, detail?: string) {
    const event: TelemetryEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      surface,
      severity,
      label,
      detail,
    };
    this.state = { ...this.state, events: [...this.state.events, event].slice(-MAX_EVENTS) };
    persistEvents(this.state.events);
    this.notify();
    this.broadcast({ type: "event", payload: event });
  }

  setSignals(signals: StreamSignals) {
    this.state = { ...this.state, signals };
    this.notify();
    this.broadcast({ type: "signals", payload: signals });
  }

  setReport(report: RangeReport) {
    this.state = { ...this.state, report };
    this.notify();
    this.broadcast({ type: "report", payload: report });
  }

  startSession(label: string) {
    const ts = Date.now();
    this.state = { ...this.state, sessionLabel: label, sessionStartedAt: ts };
    this.notify();
    this.broadcast({ type: "session-start", payload: { label, ts } });
  }

  reset() {
    this.state = { events: [], signals: emptySignals(), report: null, sessionLabel: null, sessionStartedAt: null };
    persistEvents([]);
    this.notify();
    this.broadcast({ type: "reset" });
  }
}

export const rangeStore = new RangeStore();

export function useRangeState(): RangeState {
  return useSyncExternalStore(rangeStore.subscribe, rangeStore.getSnapshot, rangeStore.getSnapshot);
}

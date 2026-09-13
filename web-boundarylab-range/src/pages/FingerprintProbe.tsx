import { useEffect, useState } from "react";
import { ArrowLeft, Fingerprint, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";

import { rangeStore } from "@/lib/rangeStore";
import { cn } from "@/lib/utils";

interface FingerprintRow {
  key: string;
  value: string;
  flag?: "warn" | "fail";
  note?: string;
}

function readWebGLInfo(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { vendor: "unavailable", renderer: "unavailable" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return { vendor, renderer };
  } catch {
    return { vendor: "error", renderer: "error" };
  }
}

function collectFingerprint(): FingerprintRow[] {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; brands?: { brand: string }[] } };
  const gl = readWebGLInfo();
  const rows: FingerprintRow[] = [
    { key: "userAgent", value: navigator.userAgent },
    { key: "platform", value: navigator.platform },
    { key: "vendor", value: navigator.vendor },
    { key: "language(s)", value: navigator.languages?.join(", ") ?? navigator.language },
    {
      key: "webdriver",
      value: String(navigator.webdriver),
      flag: navigator.webdriver ? "fail" : undefined,
      note: navigator.webdriver ? "Automation flag is set — most KYC SDKs block this outright." : undefined,
    },
    { key: "hardwareConcurrency", value: String(navigator.hardwareConcurrency) },
    {
      key: "deviceMemory",
      value: String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "n/a"),
    },
    { key: "maxTouchPoints", value: String(navigator.maxTouchPoints) },
    { key: "userAgentData.platform", value: nav.userAgentData?.platform ?? "n/a" },
    {
      key: "screen",
      value: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`,
    },
    { key: "webgl.vendor", value: gl.vendor },
    { key: "webgl.renderer", value: gl.renderer },
    {
      key: "window.chrome",
      value: "chrome" in window ? "present" : "absent",
      flag: "chrome" in window ? undefined : "warn",
      note: "chrome" in window ? undefined : "Real Chrome/WebView always exposes window.chrome.",
    },
    {
      key: "plugins.length",
      value: String(navigator.plugins?.length ?? 0),
    },
  ];
  return rows;
}

const FingerprintProbe = () => {
  const [rows, setRows] = useState<FingerprintRow[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const refresh = () => {
    const fp = collectFingerprint();
    setRows(fp);
    const flagged = fp.filter((r) => r.flag);
    rangeStore.log(
      "fingerprint",
      flagged.some((f) => f.flag === "fail") ? "fail" : flagged.length ? "warn" : "pass",
      "Fingerprint snapshot captured",
      `${fp.length} signals read, ${flagged.length} flagged`,
    );
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => {
        setDevices(list);
        rangeStore.log("enumerate", "info", `Fingerprint probe enumerateDevices → ${list.length} device(s)`);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-[#05060f] text-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link to="/" className="mb-8 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" />
          Range
        </Link>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Fingerprint className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Fingerprint inspector</h1>
              <p className="text-xs font-mono uppercase tracking-wider text-amber-500/70">navigator · webgl · devices</p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Reads the exact signals a KYC SDK's device-fingerprint layer checks — user agent, WebGL renderer,
          hardware hints, and the automation flag. Compare this against your spoofed device profile.
        </p>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-white/5 last:border-0">
                  <td className="w-1/3 bg-white/[0.02] px-4 py-2.5 font-mono text-xs text-slate-500">{r.key}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 font-mono text-xs",
                      r.flag === "fail" ? "text-rose-300" : r.flag === "warn" ? "text-amber-300" : "text-slate-200",
                    )}
                  >
                    <div className="break-all">{r.value}</div>
                    {r.note && <div className="mt-0.5 font-sans text-[11px] text-slate-500">{r.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-3 text-xs font-mono uppercase tracking-wider text-slate-500">
            enumerateDevices ({devices.length})
          </p>
          <div className="space-y-1.5">
            {devices.length === 0 && <p className="text-xs text-slate-600">No devices reported yet.</p>}
            {devices.map((d, i) => (
              <div key={i} className="flex items-center justify-between font-mono text-xs">
                <span className="text-slate-300">{d.kind}</span>
                <span className="text-slate-500">{d.label || "(no label)"}</span>
                <span className="text-slate-600">{d.deviceId ? d.deviceId.slice(0, 10) + "…" : "no id"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FingerprintProbe;

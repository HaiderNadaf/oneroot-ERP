"use client";

import { Camera, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, cx } from "./ui";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = (new (opts?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

const FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code", "itf"];

/** What the page did with a scanned code, shown under the camera (continuous mode) */
export type ScanResult = { ok: boolean; message: string } | void;

/**
 * Reads barcodes with the device camera (phone or webcam). Uses the browser's own BarcodeDetector where it has one
 * (Android Chrome, Edge, macOS Chrome) and ZXing everywhere else (iPhone Safari, Firefox, desktop Chrome on Windows/Linux).
 * `continuous`: the camera stays open and every new code goes to `onScan` (POS: scan item after item);
 * otherwise the first code is handed over and the page closes the scanner.
 */
export function CameraScanner({
  open,
  onClose,
  onScan,
  continuous = false,
  title = "Scan With Camera",
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => ScanResult;
  continuous?: boolean;
  title?: string;
}) {
  return open ? <Body onClose={onClose} onScan={onScan} continuous={continuous} title={title} /> : null;
}

/** The same code again within this long is the same item still in front of the camera */
const SAME_CODE_MS = 2000;
/** Any two reads at least this far apart, so one sweep doesn't add an item twice */
const ANY_CODE_MS = 700;

function Body({ onClose, onScan, continuous, title }: { onClose: () => void; onScan: (code: string) => ScanResult; continuous: boolean; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  // Known before starting: no camera API on this page (plain http on a phone, or an old browser)
  const unavailable = !window.isSecureContext
    ? "The camera only works on a secure address (https://, or localhost). Open the app over https on this phone."
    : !navigator.mediaDevices?.getUserMedia
      ? "This browser can't use the camera. Use Chrome, Safari or Edge, or plug in a USB barcode scanner."
      : null;
  const [failed, setFailed] = useState<string | null>(null);
  const error = unavailable ?? failed;
  const [starting, setStarting] = useState(true);
  const [last, setLast] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  // Latest handler without restarting the camera on every parent render
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (unavailable) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopZxing: (() => void) | null = null;
    let stopped = false;
    let lastCode = "";
    let lastAt = 0;

    const handle = (raw: string) => {
      const code = raw.trim();
      const now = Date.now();
      if (!code || stopped) return;
      if (now - lastAt < ANY_CODE_MS || (code === lastCode && now - lastAt < SAME_CODE_MS)) return;
      lastCode = code;
      lastAt = now;
      if (!continuous) stopped = true;
      const res = onScanRef.current(code);
      if (res) {
        setLast({ ...res, at: now });
        navigator.vibrate?.(res.ok ? 60 : [80, 60, 80]);
        beep(res.ok);
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped || !video.current) return;
        const el = video.current;
        el.srcObject = stream;
        await el.play().catch(() => {});
        setStarting(false);

        // Native detector when the browser really reads barcodes (some expose the API with no formats)
        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const nativeFormats = Native ? await Native.getSupportedFormats?.().catch(() => []) : [];
        if (Native && nativeFormats && nativeFormats.length) {
          const detector = new Native({ formats: FORMATS.filter((f) => nativeFormats.includes(f)) });
          timer = setInterval(async () => {
            if (stopped || el.readyState < 2) return;
            try {
              const hit = (await detector.detect(el)).find((c) => c.rawValue);
              if (hit) handle(hit.rawValue);
            } catch {
              /* keep trying */
            }
          }, 200);
          return;
        }

        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (stopped) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.ITF,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromStream(stream, el, (result) => {
          if (result) handle(result.getText());
        });
        if (stopped) controls.stop();
        else stopZxing = () => controls.stop();
      } catch (e) {
        const err = e as Error;
        setStarting(false);
        setFailed(
          err.name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site in the browser settings, then try again."
            : err.name === "NotFoundError"
              ? "No camera was found on this device."
              : `Camera unavailable: ${err.message}`,
        );
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [continuous, unavailable]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <Button variant={continuous ? "primary" : "secondary"} onClick={onClose}>
          {continuous ? "Done" : "Close"}
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={video} muted playsInline autoPlay className="aspect-[4/3] w-full object-cover" />
            {/* Aim box */}
            <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.25)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80" />
            </div>
            {starting && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>}
          </div>
          {last ? (
            <p
              key={last.at}
              role="status"
              className={cx(
                "flex items-start gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                last.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700",
              )}
            >
              {last.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              {last.message}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Camera className="size-3.5" /> Hold the barcode inside the box; it is read automatically
              {continuous ? " — keep scanning item after item." : "."}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Short confirmation tone: high for added, low for a problem */
function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 320;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    /* sound is optional */
  }
}

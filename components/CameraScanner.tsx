"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cameraScanSupported } from "@/lib/scanner";
import { Button, Modal } from "./ui";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

/** Reads a barcode with the device camera (Chrome / Edge / Android Chrome, which have BarcodeDetector) */
export function CameraScanner({ open, onClose, onScan }: { open: boolean; onClose: () => void; onScan: (code: string) => void }) {
  return open ? <Body onClose={onClose} onScan={onScan} /> : null;
}

function Body({ onClose, onScan }: { onClose: () => void; onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = cameraScanSupported();

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code", "itf"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        timer = setInterval(async () => {
          if (done || !video.current || video.current.readyState < 2) return;
          try {
            const codes = await detector.detect(video.current);
            const hit = codes.find((c) => c.rawValue);
            if (hit) {
              done = true;
              onScan(hit.rawValue.trim());
            }
          } catch {
            /* keep trying */
          }
        }, 250);
      })
      .catch((e: Error) => setError(e.name === "NotAllowedError" ? "Camera permission was refused" : `Camera unavailable: ${e.message}`));
    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onScan]);

  return (
    <Modal open onClose={onClose} title="Scan With Camera" size="sm" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {!supported ? (
        <p className="text-sm text-slate-600">
          This browser cannot read barcodes from the camera. Use Chrome or Edge (or Chrome on Android), or plug in a USB barcode scanner — it works on every page without setup.
        </p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <div className="space-y-2">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-lg bg-black object-cover" />
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Camera className="size-3.5" /> Point the camera at the barcode; it is read automatically.
          </p>
        </div>
      )}
    </Modal>
  );
}

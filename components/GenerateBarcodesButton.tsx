"use client";

import { Barcode as BarcodeIcon } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, errMsg, useConfirm, useToast } from "./ui";

/** Gives every active product without a barcode an in-store EAN-13 (for printing labels) */
export function GenerateBarcodesButton({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!(await confirm("Generate an in-store barcode for every active product that has none? Products that already have a barcode are left alone.", { confirmLabel: "Generate" }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ generated: number }>("/products/barcodes/generate-missing");
      toast.success(r.generated ? `${r.generated} barcode${r.generated > 1 ? "s" : ""} generated` : "Every product already has a barcode");
      onDone?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" icon={<BarcodeIcon className="size-4" />} loading={busy} onClick={run}>
      Barcodes
    </Button>
  );
}

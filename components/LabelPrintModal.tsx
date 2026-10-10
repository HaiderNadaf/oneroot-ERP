"use client";

import { Printer, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, inr, n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { printAs } from "@/lib/print";
import type { StoreSettings } from "@/lib/types";
import { Barcode, barcodeText } from "./Barcode";
import { PrintPortal } from "./PrintPortal";
import { Button, Checkbox, Field, Input, Modal, Select, cx, errMsg, useToast } from "./ui";

export interface LabelItem {
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  packSize?: string | null;
  mrp?: unknown;
  salePrice?: unknown;
  batchNo?: string | null;
  expiryDate?: string | null;
  /** Labels to print for this line */
  count: number;
}

type Size = "50x25" | "38x25" | "A4";

const SIZES: Record<Size, { label: string; w: number; h: number; page: string; cols?: number }> = {
  "50x25": { label: "Roll · 50 × 25 mm", w: 50, h: 25, page: "size: 50mm 25mm; margin: 0;" },
  "38x25": { label: "Roll · 38 × 25 mm", w: 38, h: 25, page: "size: 38mm 25mm; margin: 0;" },
  A4: { label: "A4 sheet · 65 labels (38 × 21 mm)", w: 38.1, h: 21.2, page: "size: A4; margin: 10.7mm 4.7mm;", cols: 5 },
};

/**
 * Prints barcode labels for products or received batches on a label roll or an A4 sticker sheet.
 * Products without a barcode can be given an in-store EAN-13 here.
 */
export function LabelPrintModal({ open, onClose, items: initial }: { open: boolean; onClose: () => void; items: LabelItem[] }) {
  return open ? <Body onClose={onClose} initial={initial} /> : null;
}

function Body({ onClose, initial }: { onClose: () => void; initial: LabelItem[] }) {
  const toast = useToast();
  const { can } = useAuth();
  const { data: store } = useApi<StoreSettings>("/settings");
  const [items, setItems] = useState(initial);
  const [size, setSize] = useState<Size>("50x25");
  const [showStore, setShowStore] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBatch, setShowBatch] = useState(true);
  const [busy, setBusy] = useState(false);

  const missing = items.filter((i) => !i.barcode);
  const spec = SIZES[size];
  const labels = items.filter((i) => i.barcode && i.count > 0).flatMap((i) => Array.from({ length: Math.min(i.count, 500) }, () => i));

  async function generate() {
    setBusy(true);
    try {
      const updated = [...items];
      for (const i of missing) {
        const p = await api.post<{ barcode: string }>(`/products/${i.productId}/barcode`);
        for (const u of updated) if (u.productId === i.productId) u.barcode = p.barcode;
      }
      setItems(updated);
      toast.success(`Barcode${missing.length > 1 ? "s" : ""} generated`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = { width: `${spec.w}mm`, height: `${spec.h}mm` };
  const small = spec.h < 25;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Print barcode labels"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button icon={<Printer className="size-4" />} disabled={!labels.length} onClick={() => printAs("labels", spec.page)}>
              Print {labels.length} label{labels.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Label size" className="col-span-2">
            <Select value={size} onChange={(e) => setSize(e.target.value as Size)}>
              {(Object.keys(SIZES) as Size[]).map((s) => (
                <option key={s} value={s}>
                  {SIZES[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="col-span-2 flex flex-wrap items-end gap-3 pb-1">
            <Checkbox label="Store name" checked={showStore} onChange={setShowStore} />
            <Checkbox label="MRP / price" checked={showPrice} onChange={setShowPrice} />
            <Checkbox label="Batch & expiry" checked={showBatch} onChange={setShowBatch} />
          </div>
        </div>

        {missing.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span>
              {missing.length} product{missing.length > 1 ? "s have" : " has"} no barcode: {missing.map((m) => m.name).join(", ")}
            </span>
            {can("MANAGER") && (
              <Button size="sm" variant="secondary" icon={<Sparkles className="size-4" />} loading={busy} onClick={generate}>
                Generate in-store barcodes
              </Button>
            )}
          </div>
        )}

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 text-left">Product</th>
              <th className="py-2 text-left">Barcode</th>
              <th className="py-2 text-left">Batch</th>
              <th className="w-24 py-2 text-right">Labels</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={`${i.productId}-${i.batchNo ?? ""}-${idx}`} className="border-b border-slate-100">
                <td className="py-2 pr-2">
                  <p className="font-medium text-slate-800">{i.name}</p>
                  <p className="text-xs text-slate-500">{[i.sku, i.packSize].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="py-2 pr-2 font-mono text-xs">{i.barcode || <span className="text-amber-700">none</span>}</td>
                <td className="py-2 pr-2 text-xs text-slate-600">
                  {i.batchNo || "—"}
                  {i.expiryDate && <span className="block text-slate-400">exp {date(i.expiryDate)}</span>}
                </td>
                <td className="py-2">
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    value={String(i.count)}
                    onChange={(e) => setItems((ls) => ls.map((l, j) => (j === idx ? { ...l, count: Math.max(0, Number(e.target.value) || 0) } : l)))}
                    className="num h-8 text-right"
                    aria-label={`Labels for ${i.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {labels[0] && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Preview</p>
            <div className="inline-block border border-dashed border-slate-300">
              <Label item={labels[0]} store={showStore ? store?.storeName : undefined} price={showPrice} batch={showBatch} small={small} style={labelStyle} />
            </div>
          </div>
        )}
      </Modal>

      {/* Printed only in label mode (see globals.css) */}
      <PrintPortal className="label-host">
        <div
          className={cx("label-sheet hidden")}
          style={spec.cols ? { gridTemplateColumns: `repeat(${spec.cols}, ${spec.w}mm)`, columnGap: "2.5mm", rowGap: "0" } : undefined}
        >
          {labels.map((item, i) => (
            <Label
              key={i}
              item={item}
              store={showStore ? store?.storeName : undefined}
              price={showPrice}
              batch={showBatch}
              small={small}
              style={{ ...labelStyle, ...(spec.cols ? {} : { pageBreakAfter: "always", breakAfter: "page" }) }}
            />
          ))}
        </div>
      </PrintPortal>
    </>
  );
}

function Label({
  item,
  store,
  price,
  batch,
  small,
  style,
}: {
  item: LabelItem;
  store?: string;
  price: boolean;
  batch: boolean;
  small: boolean;
  style: React.CSSProperties;
}) {
  const mrp = n(item.mrp) > 0 ? n(item.mrp) : n(item.salePrice);
  const fs = (px: number) => ({ fontSize: `${small ? px - 1 : px}px`, lineHeight: 1.15 });
  return (
    <div style={{ ...style, boxSizing: "border-box", padding: "0.8mm 1.5mm", overflow: "hidden", background: "#fff", color: "#000" }} className="flex flex-col">
      {store && (
        <p style={fs(6.5)} className="shrink-0 truncate text-center font-semibold uppercase tracking-wide">
          {store}
        </p>
      )}
      <p style={fs(8.5)} className={cx("shrink-0 font-bold", small ? "truncate" : "line-clamp-2")}>
        {item.name}
        {item.packSize ? ` ${item.packSize}` : ""}
      </p>
      {/* Bars take whatever height is left; the number is printed as text so it never distorts */}
      <div className="min-h-0 flex-1" style={{ marginTop: "0.4mm" }}>
        <Barcode value={item.barcode!} moduleWidth={1} stretch />
      </div>
      <p style={{ ...fs(7.5), letterSpacing: "0.08em" }} className="num shrink-0 text-center">
        {barcodeText(item.barcode!)}
      </p>
      <p style={fs(6.5)} className="flex shrink-0 justify-between gap-1">
        <span className="truncate">{batch && item.batchNo ? `B: ${item.batchNo}${item.expiryDate ? ` · Exp ${date(item.expiryDate)}` : ""}` : item.sku}</span>
        {price && mrp > 0 && <span className="shrink-0 font-bold">MRP {inr(mrp)}</span>}
      </p>
    </div>
  );
}

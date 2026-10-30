"use client";

// import { ScanLine } from "lucide-react"; // only the commented-out SerialPicker used it
// import { useState } from "react";
import { useApi } from "@/lib/hooks";
import type { SerialNumber } from "@/lib/types";
import { /* Button, Input, Modal, */ Select, cx /* , useToast */ } from "./ui";

// The SerialPicker modal is not used anywhere (POS uses SerialSelect below)
// /**
//  * Pick which serial-numbered units leave with a bill: tick them, or scan / type each serial.
//  * Only units in stock in the current branch are offered.
//  */
// export function SerialPicker({
//   open,
//   productId,
//   productName,
//   quantity,
//   value,
//   onClose,
//   onChange,
// }: {
//   open: boolean;
//   productId: string;
//   productName: string;
//   quantity: number;
//   value: string[];
//   onClose: () => void;
//   onChange: (serials: string[]) => void;
// }) {
//   return open ? <PickerBody productId={productId} productName={productName} quantity={quantity} value={value} onClose={onClose} onChange={onChange} /> : null;
// }
//
// function PickerBody({ productId, productName, quantity, value, onClose, onChange }: { productId: string; productName: string; quantity: number; value: string[]; onClose: () => void; onChange: (serials: string[]) => void }) {
//   const toast = useToast();
//   const { data, loading } = useApi<SerialNumber[]>(`/products/${productId}/serials`, { status: "IN_STOCK" });
//   const [picked, setPicked] = useState<string[]>(value);
//   const [scan, setScan] = useState("");
//   const [filter, setFilter] = useState("");
//   const all = data ?? [];
//   const shown = all.filter((s) => !filter || s.serialNo.toLowerCase().includes(filter.toLowerCase()));
//
//   function toggle(serialNo: string) {
//     if (picked.includes(serialNo)) setPicked(picked.filter((x) => x !== serialNo));
//     else if (picked.length >= quantity) toast.error(`Only ${quantity} unit${quantity === 1 ? "" : "s"} on this line`);
//     else setPicked([...picked, serialNo]);
//   }
//
//   function scanOne(e: React.FormEvent) {
//     e.preventDefault();
//     const code = scan.trim();
//     if (!code) return;
//     const hit = all.find((s) => s.serialNo.toLowerCase() === code.toLowerCase());
//     if (!hit) toast.error(`Serial ${code} is not in stock here`);
//     else if (!picked.includes(hit.serialNo)) toggle(hit.serialNo);
//     setScan("");
//   }
//
//   return (
//     <Modal
//       open
//       onClose={onClose}
//       title={`Serial Numbers · ${productName}`}
//       size="sm"
//       footer={
//         <>
//           <Button variant="secondary" onClick={onClose}>
//             Cancel
//           </Button>
//           <Button
//             disabled={picked.length !== quantity}
//             onClick={() => {
//               onChange(picked);
//               onClose();
//             }}
//           >
//             Use {picked.length}/{quantity}
//           </Button>
//         </>
//       }
//     >
//       <form onSubmit={scanOne} className="relative mb-2">
//         <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
//         <Input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type a serial and press Enter" className="pl-9 font-mono" autoFocus />
//       </form>
//       <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="mb-2 h-8 text-xs" />
//       {loading && !data ? (
//         <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
//       ) : !all.length ? (
//         <p className="py-4 text-center text-sm text-slate-400">No serial numbers registered in stock here — add them on the product page or at goods inward.</p>
//       ) : (
//         <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
//           {shown.map((s) => {
//             const on = picked.includes(s.serialNo);
//             return (
//               <li key={s.id}>
//                 <button type="button" onClick={() => toggle(s.serialNo)} className={cx("flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 sm:py-2", on && "bg-brand-50")}>
//                   <span className="min-w-0 break-all font-mono">{s.serialNo}</span>
//                   <span className="shrink-0 text-xs text-slate-500">
//                     {s.batch?.batchNo && s.batch.batchNo !== "DEFAULT" ? `Batch ${s.batch.batchNo} · ` : ""}
//                     {on ? "✓ picked" : ""}
//                   </span>
//                 </button>
//               </li>
//             );
//           })}
//         </ul>
//       )}
//       <p className="mt-2 text-xs text-slate-500">
//         {picked.length} of {quantity} picked · {all.length} in stock
//       </p>
//     </Modal>
//   );
// }

/** "SP-0041", or "SP-0041 · Batch B12" when the unit's batch number differs from its serial */
const entryLabel = (s: SerialNumber) => (s.batch?.batchNo && s.batch.batchNo !== s.serialNo && s.batch.batchNo !== "DEFAULT" ? `${s.serialNo} · Batch ${s.batch.batchNo}` : s.serialNo);

/**
 * POS: one Batch / Serial No. dropdown per unit on the line, listing that product's entries in stock in this branch
 * (added at goods inward). Hands back the picked serials and the batch each one sits in.
 */
export function SerialSelect({
  productId,
  quantity,
  value,
  onChange,
}: {
  productId: string;
  quantity: number;
  value: string[];
  onChange: (serialNos: string[], batchOf: Record<string, string | null>) => void;
}) {
  const { data, loading } = useApi<SerialNumber[]>(`/products/${productId}/serials`, { status: "IN_STOCK" });
  const all = data ?? [];
  const units = Math.max(1, Math.round(quantity) || 1);

  function pick(i: number, serialNo: string) {
    const next = Array.from({ length: units }, (_, j) => (j === i ? serialNo : (value[j] ?? ""))).filter(Boolean);
    onChange(next, Object.fromEntries(all.filter((s) => next.includes(s.serialNo)).map((s) => [s.serialNo, s.batchId ?? null])));
  }

  return (
    <div className="mt-1 space-y-1">
      {Array.from({ length: units }, (_, i) => {
        const current = value[i] ?? "";
        // An entry picked for another unit isn't offered again
        const options = all.filter((s) => s.serialNo === current || !value.includes(s.serialNo));
        return (
          <Select
            key={i}
            value={current}
            onChange={(e) => pick(i, e.target.value)}
            disabled={loading && !data}
            className={cx("h-8 text-xs", !current && "border-amber-400 bg-amber-50")}
            aria-label={`Batch / Serial No.${units > 1 ? ` ${i + 1}` : ""}`}
          >
            <option value="">
              {loading && !data ? "Loading…" : !all.length ? "No Batch / Serial No. in stock here" : `Select Batch / Serial No.${units > 1 ? ` (unit ${i + 1})` : ""}`}
            </option>
            {options.map((s) => (
              <option key={s.id} value={s.serialNo}>
                {entryLabel(s)}
              </option>
            ))}
          </Select>
        );
      })}
    </div>
  );
}

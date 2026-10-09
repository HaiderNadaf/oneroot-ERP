"use client";

import { ArrowRight, Loader2, PackageOpen, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useBranch } from "@/lib/branch";
import { date, n, qty, today } from "@/lib/format";
import type { Batch, Product, StockTransfer } from "@/lib/types";
import { BranchNotice, useBranchOptions } from "./BranchNotice";
import { ProductPicker } from "./pickers";
import { Button, Field, Input, Modal, Select, Table, Td, Textarea, Th, cx, errMsg, useToast } from "./ui";

interface Line {
  key: number;
  product: Product;
  /** null while the product's batches load */
  batches: Batch[] | null;
  loadError?: string;
  batchId: string;
  quantity: string;
}

/**
 * Send stock from the branch selected in the top bar to another branch → POST /stock-transfers.
 * Batch no., expiry and cost travel with the stock. Managers only.
 */
export function TransferModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (t: StockTransfer) => void }) {
  if (!open) return null;
  // Mounted fresh on every open, so the initial state is the reset
  return <TransferForm onClose={onClose} onSaved={onSaved} />;
}

function TransferForm({ onClose, onSaved }: { onClose: () => void; onSaved?: (t: StockTransfer) => void }) {
  const toast = useToast();
  const { current, currentId } = useBranch();
  const { branches, loading: branchesLoading } = useBranchOptions();
  const destinations = branches.filter((b) => b.id !== currentId);
  const blocked = currentId === "all" || !current;

  const [toBranchId, setToBranchId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const toBranch = destinations.find((b) => b.id === toBranchId) ?? null;
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function addProduct(p: Product) {
    const key = ++seq.current;
    setLines((ls) => [...ls, { key, product: p, batches: null, batchId: "", quantity: "" }]);
    try {
      // With a branch selected the API returns only that branch's batches
      const full = await api.get<Product>(`/products/${p.id}`);
      const batches = (full.batches ?? [])
        .filter((b) => n(b.quantity) > 0 && (!b.branchId || b.branchId === currentId))
        .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
      update(key, { batches, batchId: batches[0]?.id ?? "" });
    } catch (e) {
      update(key, { batches: [], loadError: errMsg(e) });
    }
  }

  const rows = lines.map((l) => {
    const batch = l.batches?.find((b) => b.id === l.batchId) ?? null;
    const q = Number(l.quantity) || 0;
    const available = batch ? n(batch.quantity) : 0;
    // The same batch on several lines draws on one stock figure
    const sameBatch = lines.filter((x) => x.batchId && x.batchId === l.batchId).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    let error: string | null = null;
    if (l.batches && !l.batches.length) error = l.loadError ?? `No stock of this product in ${current?.name ?? "this branch"}`;
    else if (l.batches && !batch) error = "Choose a batch";
    else if (!(q > 0)) error = submitted ? "Enter the quantity to send" : null;
    else if (batch && sameBatch > available + 0.0005) error = `Only ${qty(available)} ${l.product.unit} in batch ${batch.batchNo}`;
    return { l, batch, available, error };
  });
  const totalQty = rows.reduce((s, r) => s + (Number(r.l.quantity) || 0), 0);

  async function save() {
    setSubmitted(true);
    if (blocked) return toast.error("Pick the branch to send from in the top bar");
    if (!toBranch) return toast.error("Choose the branch to send stock to");
    if (!lines.length) return toast.error("Add at least one product");
    if (lines.some((l) => !l.batches)) return toast.error("Batches are still loading");
    for (const r of rows) {
      if (!(Number(r.l.quantity) > 0)) return toast.error(`${r.l.product.name}: enter the quantity to send`);
      if (r.error) return toast.error(`${r.l.product.name}: ${r.error}`);
    }
    if (transferDate > today()) return toast.error("Transfer date can't be in the future");
    setSaving(true);
    try {
      const t = await api.post<StockTransfer>("/stock-transfers", {
        toBranchId: toBranch.id,
        transferDate,
        notes: notes.trim() || undefined,
        items: lines.map((l) => ({ batchId: l.batchId, quantity: Number(l.quantity) })),
      });
      toast.success(`${t.transferNo} sent to ${toBranch.name}`);
      onSaved?.(t);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="New stock transfer"
      footer={
        <>
          {lines.length > 0 && (
            <span className="mr-auto self-center text-sm text-slate-600">
              {lines.length} line{lines.length === 1 ? "" : "s"} · <span className="num font-medium text-slate-900">{qty(totalQty)}</span> units
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={blocked || !lines.length || !destinations.length}>
            Send stock
          </Button>
        </>
      }
    >
      {blocked ? (
        <BranchNotice action="send stock from it" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr_160px]">
            <Field label="From">
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
                {current.name}
                <span className="ml-1.5 font-mono text-[11px] text-slate-500">{current.code}</span>
              </div>
            </Field>
            <ArrowRight className="mx-auto mb-2.5 hidden size-4 text-slate-400 sm:block" />
            <Field label="To branch" required>
              <Select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className={cx(submitted && !toBranchId && "border-red-400")}
                disabled={branchesLoading && !branches.length}
                autoFocus
              >
                <option value="">{branchesLoading && !branches.length ? "Loading branches…" : "Choose branch…"}</option>
                {destinations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" required>
              <Input type="date" value={transferDate} max={today()} onChange={(e) => setTransferDate(e.target.value)} />
            </Field>
          </div>
          {!branchesLoading && !destinations.length && (
            <p className="text-sm text-amber-700">There is no other active branch to send stock to. Add one under Admin → Branches.</p>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Products to send</p>
            <ProductPicker onPick={addProduct} inStockOnly />
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              <PackageOpen className="mx-auto mb-2 size-7 text-slate-300" />
              Search a product above, then choose the batch and quantity to send.
            </div>
          ) : (
            <Table className="rounded-lg border border-slate-200">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Batch</Th>
                  <Th right>Quantity</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ l, batch, available, error }) => (
                  <tr key={l.key} className="align-top">
                    <Td className="min-w-48">
                      <p className="font-medium text-slate-900">{l.product.name}</p>
                      <p className="text-xs text-slate-500">
                        {l.product.sku} · {l.product.unit}
                      </p>
                    </Td>
                    <Td>
                      {!l.batches ? (
                        <span className="flex h-9 items-center gap-1.5 text-xs text-slate-500">
                          <Loader2 className="size-4 animate-spin" /> Loading batches…
                        </span>
                      ) : (
                        <Select
                          value={l.batchId}
                          onChange={(e) => update(l.key, { batchId: e.target.value })}
                          disabled={!l.batches.length}
                          className="w-72"
                          aria-label={`Batch for ${l.product.name}`}
                        >
                          {!l.batches.length && <option value="">No stock</option>}
                          {l.batches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNo} · {b.expiryDate ? `exp ${date(b.expiryDate)}` : "no expiry"} · {qty(b.quantity)} {l.product.unit}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Td>
                    <Td right>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        className={cx("num w-28 text-right", error && Number(l.quantity) > 0 && "border-red-400")}
                        aria-label={`Quantity of ${l.product.name}`}
                        disabled={!batch}
                      />
                      {batch && (
                        <span className="mt-1 block text-xs text-slate-400">
                          {qty(available)} available
                          {available > 0 && Number(l.quantity) !== available && (
                            <button type="button" className="ml-1 text-brand-700 hover:underline" onClick={() => update(l.key, { quantity: String(available) })}>
                              · all
                            </button>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td right>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="size-4" />}
                        aria-label={`Remove ${l.product.name}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      />
                    </Td>
                  </tr>
                ))}
                {rows.some((r) => r.error) && (
                  <tr>
                    <td colSpan={4} className="px-3 py-2">
                      <ul className="space-y-0.5 text-xs text-red-600">
                        {rows
                          .filter((r) => r.error)
                          .map((r) => (
                            <li key={r.l.key}>
                              {r.l.product.name}: {r.error}
                            </li>
                          ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}

          <Field label="Notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason, vehicle, who is carrying it…" />
          </Field>
          <p className="text-xs text-slate-500">
            Stock leaves {current.name} and arrives in {toBranch?.name ?? "the other branch"} straight away, keeping its batch no., expiry and
            cost. Managers there are notified.
          </p>
        </div>
      )}
    </Modal>
  );
}

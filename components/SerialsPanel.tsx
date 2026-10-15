"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Batch, SerialNumber } from "@/lib/types";
import { Badge, Button, Card, EmptyRow, LoadingRow, Modal, Select, Table, Td, Textarea, Th, errMsg, useConfirm, useToast } from "./ui";

/** Serial numbers of a product in the current branch: register new ones, see which bill took each */
export function SerialsPanel({ productId, batches }: { productId: string; batches: Batch[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [status, setStatus] = useState("IN_STOCK");
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useApi<SerialNumber[]>(`/products/${productId}/serials`, { status });

  async function register(e: React.FormEvent) {
    e.preventDefault();
    const serialNos = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
    if (!serialNos.length) return toast.error("Paste or scan at least one serial number");
    setBusy(true);
    try {
      const r = await api.post<{ added: number; skipped: string[] }>(`/products/${productId}/serials`, { serialNos, batchId: batchId || undefined });
      toast.success(`${r.added} serial${r.added === 1 ? "" : "s"} registered${r.skipped.length ? ` · ${r.skipped.length} already known` : ""}`);
      setAdding(false);
      setText("");
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: SerialNumber) {
    if (!(await confirm(`Remove serial ${s.serialNo}?`, { danger: true, confirmLabel: "Remove" }))) return;
    try {
      await api.del(`/serials/${s.id}`);
      void reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Card
      title="Serial numbers"
      bodyClassName="p-0"
      actions={
        <div className="flex items-center gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-32 text-xs" aria-label="Serial status">
            <option value="IN_STOCK">In stock</option>
            <option value="SOLD">Sold</option>
            <option value="">All</option>
          </Select>
          {can("products.manage") && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Register
            </Button>
          )}
        </div>
      }
    >
      <Table>
        <thead>
          <tr>
            <Th>Serial</Th>
            <Th className="hidden md:table-cell">Batch</Th>
            <Th>Status</Th>
            <Th>Bill</Th>
            <Th className="hidden md:table-cell">Since</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {loading && !data ? (
            <LoadingRow colSpan={6} />
          ) : !data?.length ? (
            <EmptyRow colSpan={6}>{status === "IN_STOCK" ? "No serial-numbered units in stock here — register the serials of the units on the shelf" : "Nothing"}</EmptyRow>
          ) : (
            data.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="min-w-28 break-all font-mono">{s.serialNo}</Td>
                <Td className="hidden text-xs md:table-cell">{s.batch?.batchNo && s.batch.batchNo !== "DEFAULT" ? s.batch.batchNo : "—"}</Td>
                <Td>{s.status === "IN_STOCK" ? <Badge tone="green">In stock</Badge> : <Badge>Sold</Badge>}</Td>
                <Td className="text-xs">{s.saleItem?.sale?.invoiceNo ?? "—"}</Td>
                <Td className="hidden whitespace-nowrap text-xs md:table-cell">{dateTime(s.soldAt ?? s.createdAt)}</Td>
                <Td right>
                  {s.status === "IN_STOCK" && can("products.manage") && (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Remove serial" onClick={() => remove(s)} />
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Register serial numbers"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" form="serials-form" loading={busy}>
              Register
            </Button>
          </>
        }
      >
        <form id="serials-form" onSubmit={register} className="space-y-3">
          <p className="text-sm text-slate-600">One serial per line (scan them one after another). They are tagged to the units already in stock in this branch; registering does not change the quantity.</p>
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="font-mono" autoFocus placeholder={"SPR-2026-0001\nSPR-2026-0002"} />
          {batches.length > 0 && (
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch">
              <option value="">Batch (optional)</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNo}
                </option>
              ))}
            </Select>
          )}
        </form>
      </Modal>
    </Card>
  );
}

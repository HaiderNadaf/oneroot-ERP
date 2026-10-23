"use client";

import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNeedBranch } from "@/components/BranchNotice";
import { LoadLines, type LoadLine } from "@/components/VanLoadLines";
import { Badge, Button, Card, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, Select, Table, Td, Textarea, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, inr, n } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { VanTrip } from "@/lib/types";

export default function VanTripsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const { can } = useAuth();
  const [opening, setOpening] = useState(false);
  const { data, error, loading, reload } = useApi<(VanTrip & { lines: number; salesTotal: number; _count: { sales: number } })[]>("/van-trips", { status });

  return (
    <>
      <PageHeader
        title="Van Trips"
        subtitle="Load stock onto the van in the morning, bill farmers in the villages against the trip, and reconcile returns and cash in the evening"
        actions={
          can("sales.van") && (
            <Button icon={<Plus className="size-4" />} onClick={() => setOpening(true)}>
              Load a Van
            </Button>
          )
        }
      />
      <Card bodyClassName="p-0">
        <div className="flex items-center gap-2 border-b border-slate-100 p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
            <option value="">All Trips</option>
            <option value="OPEN">On the Road</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Trip</Th>
                <Th>Date</Th>
                <Th>Salesperson</Th>
                <Th>Vehicle · Route</Th>
                <Th right>Products</Th>
                <Th right>Bills</Th>
                <Th right>Sales</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={8} />
              ) : !data?.length ? (
                <EmptyRow colSpan={8}>No van trips yet — load a van to sell in the villages</EmptyRow>
              ) : (
                data.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/van/${t.id}`)}>
                    <Td className="font-medium text-brand-700">
                      <Link href={`/van/${t.id}`}>{t.tripNo}</Link>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{dateTime(t.date)}</Td>
                    <Td>{t.user?.name}</Td>
                    <Td className="text-xs text-slate-600">{[t.vehicleNo, t.route].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td right>{t.lines}</Td>
                    <Td right>{t._count.sales}</Td>
                    <Td right className="font-semibold">{inr(t.salesTotal)}</Td>
                    <Td>
                      {t.status === "OPEN" ? (
                        <Badge tone="amber">On the Road</Badge>
                      ) : n(t.cashDifference) !== 0 ? (
                        <Badge tone="red">Closed · cash {n(t.cashDifference) > 0 ? "over" : "short"} {inr(Math.abs(n(t.cashDifference)))}</Badge>
                      ) : (
                        <Badge tone="green">Closed</Badge>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Card>
      {opening && (
        <OpenTripModal
          onClose={() => setOpening(false)}
          onOpened={(id) => {
            setOpening(false);
            router.push(`/van/${id}`);
          }}
        />
      )}
    </>
  );
}

function OpenTripModal({ onClose, onOpened }: { onClose: () => void; onOpened: (id: string) => void }) {
  const toast = useToast();
  const needBranch = useNeedBranch("load a van from it");
  const [vehicleNo, setVehicleNo] = useState("");
  const [route, setRoute] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const items = lines.filter((l) => n(l.quantity) > 0).map((l) => ({ productId: l.product.id, quantity: n(l.quantity) }));
    if (!items.length) return toast.error("Add at least one product with a quantity");
    setBusy(true);
    try {
      const t = await api.post<VanTrip>("/van-trips", { vehicleNo: vehicleNo.trim() || undefined, route: route.trim() || undefined, openingCash: n(openingCash) || 0, notes: notes.trim() || undefined, items });
      toast.success(`Trip ${t.tripNo} loaded — bill from it on the POS`);
      onOpened(t.id);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Load a Van"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="van-open" loading={busy} disabled={needBranch.blocked} icon={<Truck className="size-4" />}>
            Start Trip
          </Button>
        </>
      }
    >
      {needBranch.notice && <div className="mb-3">{needBranch.notice}</div>}
      <form id="van-open" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Vehicle No.">
          <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="TN 33 AB 1234" />
        </Field>
        <Field label="Route / Villages" className="sm:col-span-2">
          <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Perundurai – Kodumudi – Chennimalai" />
        </Field>
        <Field label="Opening Cash (Change)" hint="Cash given to the van for change">
          <Input type="number" min="0" step="1" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="num" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Stock Loaded" required className="sm:col-span-3" hint="Loaded stock stays in the branch's books but is reserved for the van until it comes back">
          <LoadLines lines={lines} setLines={setLines} />
        </Field>
      </form>
    </Modal>
  );
}

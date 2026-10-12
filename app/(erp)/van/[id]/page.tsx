"use client";

import { ArrowLeft, PackagePlus, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyRow, ErrorBox, Field, Input, Modal, PageHeader, Spinner, StatCard, Table, Td, Textarea, Th, cx, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { modeLabel, type VanTripDetail } from "@/lib/types";
import { LoadLines, type LoadLine } from "@/components/VanLoadLines";

export default function VanTripPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: t, error, loading, reload } = useApi<VanTripDetail>(`/van-trips/${id}`);
  const [topUp, setTopUp] = useState(false);
  const [closing, setClosing] = useState(false);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !t) return <Spinner />;
  if (!t) return null;
  const open = t.status === "OPEN";
  const mine = t.userId === user?.id;

  return (
    <>
      <PageHeader
        title={`Van trip ${t.tripNo}`}
        subtitle={[t.user?.name, t.vehicleNo, t.route, dateTime(t.date)].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href="/van">
              <Button variant="secondary" icon={<ArrowLeft className="size-4" />}>
                Trips
              </Button>
            </Link>
            {open && (
              <>
                {mine && (
                  <Link href={`/sales/new?vanTripId=${t.id}`}>
                    <Button icon={<ShoppingCart className="size-4" />}>Bill on this trip</Button>
                  </Link>
                )}
                <Button variant="secondary" icon={<PackagePlus className="size-4" />} onClick={() => setTopUp(true)}>
                  Load more
                </Button>
                <Button variant="secondary" icon={<Truck className="size-4" />} onClick={() => setClosing(true)}>
                  Close trip
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Sales on the trip" value={inr(t.summary.salesTotal)} sub={`${t.summary.bills} bill${t.summary.bills === 1 ? "" : "s"}`} />
        <StatCard label="Cash collected" value={inr(t.summary.cashSales)} />
        <StatCard label="On credit" value={inr(t.summary.credit)} tone={t.summary.credit > 0 ? "amber" : undefined} />
        <StatCard label="Cash to hand over" value={inr(t.summary.cashExpected)} sub={`incl. ${inr(t.openingCash)} opening cash`} />
        {open ? (
          <StatCard label="Status" value="On the road" tone="amber" />
        ) : (
          <StatCard
            label="Cash difference"
            value={inr(t.cashDifference)}
            tone={Math.abs(n(t.cashDifference)) >= 0.5 ? "red" : "green"}
            sub={`handed over ${inr(t.cashHandedOver)}`}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Stock on the van" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th right>Loaded</Th>
                <Th right>Sold</Th>
                <Th right>{open ? "On the van" : "Came back"}</Th>
                {!open && <Th right>Short</Th>}
              </tr>
            </thead>
            <tbody>
              {t.items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <span className="font-medium text-slate-800">{i.product.name}</span>
                    <span className="block text-xs text-slate-500">{i.product.sku}</span>
                  </Td>
                  <Td right>{qty(i.loadedQty)}</Td>
                  <Td right>{qty(i.soldQty)}</Td>
                  <Td right className="font-semibold">
                    {open ? qty(i.onVan) : qty(i.returnedQty ?? 0)} <span className="text-xs font-normal text-slate-500">{i.product.unit}</span>
                  </Td>
                  {!open && <Td right className={cx(n(i.shortQty) > 0 && "font-semibold text-red-600")}>{n(i.shortQty) > 0 ? qty(i.shortQty) : "—"}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
          {!open && t.closeNote && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">Closing note: {t.closeNote}</p>}
        </Card>

        <div className="space-y-4">
          <Card title="Bills on the trip" bodyClassName="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Farmer</Th>
                  <Th right>Total</Th>
                  <Th>Paid by</Th>
                </tr>
              </thead>
              <tbody>
                {!t.sales.length ? (
                  <EmptyRow colSpan={4}>No bills yet</EmptyRow>
                ) : (
                  t.sales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <Td>
                        <Link href={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                          {s.invoiceNo}
                        </Link>
                      </Td>
                      <Td className="text-xs">{s.customer?.name ?? s.customerName ?? "Walk-in"}</Td>
                      <Td right>{inr(s.totalAmount)}</Td>
                      <Td className="text-xs">{n(s.paidAmount) < n(s.totalAmount) ? <Badge tone="amber">Credit {inr(n(s.totalAmount) - n(s.paidAmount))}</Badge> : modeLabel(s.paymentMode)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
          {t.summary.byMode.length > 0 && (
            <Card title="Collected by mode">
              <ul className="space-y-1 text-sm">
                {t.summary.byMode.map((m) => (
                  <li key={m.mode} className="flex justify-between">
                    <span>{modeLabel(m.mode)}</span>
                    <span className="num font-medium">{inr(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {topUp && (
        <TopUpModal
          tripId={t.id}
          onClose={() => setTopUp(false)}
          onSaved={() => {
            setTopUp(false);
            void reload();
          }}
        />
      )}
      {closing && (
        <CloseModal
          trip={t}
          onClose={() => setClosing(false)}
          onSaved={() => {
            setClosing(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

function TopUpModal({ tripId, onClose, onSaved }: { tripId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    const items = lines.filter((l) => n(l.quantity) > 0).map((l) => ({ productId: l.product.id, quantity: n(l.quantity) }));
    if (!items.length) return toast.error("Add at least one product with a quantity");
    setBusy(true);
    try {
      await api.post(`/van-trips/${tripId}/load`, { items });
      toast.success("Loaded");
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Load more onto the van"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Load
          </Button>
        </>
      }
    >
      <LoadLines lines={lines} setLines={setLines} />
    </Modal>
  );
}

function CloseModal({ trip, onClose, onSaved }: { trip: VanTripDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const [back, setBack] = useState<Record<string, string>>(() => Object.fromEntries(trip.items.map((i) => [i.productId, String(i.onVan)])));
  const [cash, setCash] = useState(String(trip.summary.cashExpected));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const shortages = trip.items.map((i) => ({ i, short: round2(i.onVan - n(back[i.productId])) })).filter((x) => x.short > 0);
  const over = trip.items.filter((i) => n(back[i.productId]) > i.onVan + 1e-9);
  const cashDiff = round2(n(cash) - trip.summary.cashExpected);
  const gap = shortages.length > 0 || Math.abs(cashDiff) >= 0.5;

  async function save() {
    if (over.length) return toast.error(`${over[0].product.name}: more came back than was on the van`);
    if (gap && !note.trim()) return toast.error("Explain the shortage / cash difference");
    setBusy(true);
    try {
      await api.post(`/van-trips/${trip.id}/close`, {
        returns: trip.items.map((i) => ({ productId: i.productId, returnedQty: n(back[i.productId]) })),
        cashHandedOver: n(cash),
        note: note.trim() || undefined,
      });
      toast.success(`Trip ${trip.tripNo} closed`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Close trip ${trip.tripNo}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} variant={gap ? "danger" : "primary"} onClick={() => void save()}>
            {gap ? "Close with differences" : "Close trip"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">Count what came back on the van and the cash handed over. Anything missing is written off from the branch&apos;s stock as a shortage.</p>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th right>Should be on the van</Th>
            <Th right>Counted back</Th>
            <Th right>Short</Th>
          </tr>
        </thead>
        <tbody>
          {trip.items.map((i) => {
            const short = round2(i.onVan - n(back[i.productId]));
            return (
              <tr key={i.id}>
                <Td className="font-medium">{i.product.name}</Td>
                <Td right>
                  {qty(i.onVan)} {i.product.unit}
                </Td>
                <Td right>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={back[i.productId] ?? ""}
                    onChange={(e) => setBack((b) => ({ ...b, [i.productId]: e.target.value }))}
                    className="num h-8 w-24 text-right"
                    aria-label={`Counted back: ${i.product.name}`}
                  />
                </Td>
                <Td right className={cx(short > 0 ? "font-semibold text-red-600" : short < 0 ? "text-red-600" : "text-slate-400")}>
                  {short > 0 ? qty(short) : short < 0 ? "too many" : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Cash handed over" hint={`Expected ${inr(trip.summary.cashExpected)} (opening ${inr(trip.openingCash)} + cash bills ${inr(trip.summary.cashSales)}${trip.summary.cashRefunds ? ` − refunds ${inr(trip.summary.cashRefunds)}` : ""})`}>
          <Input type="number" min="0" step="1" value={cash} onChange={(e) => setCash(e.target.value)} className="num" />
        </Field>
        <div className="flex items-end pb-2 text-sm">
          {Math.abs(cashDiff) >= 0.5 ? (
            <span className="font-semibold text-red-600">
              Cash {cashDiff > 0 ? "over" : "short"} by {inr(Math.abs(cashDiff))}
            </span>
          ) : (
            <span className="text-brand-700">Cash matches</span>
          )}
        </div>
        <Field label="Note" required={gap} className="sm:col-span-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={gap ? "What happened? e.g. 1 bag torn on the road, ₹50 change given extra" : "Optional"} />
        </Field>
        {gap && !can("cash.manage") && <p className="text-xs text-amber-700 sm:col-span-2">A trip with a shortage or cash difference has to be closed by a manager.</p>}
      </div>
    </Modal>
  );
}

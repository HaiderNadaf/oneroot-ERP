"use client";

import { AlertTriangle, ArrowLeft, Banknote, Ban, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { NotesPanel, postedNotesTotal } from "@/components/NotesPanel";
import { PartyPaymentForm, modeLabel, type FixedParty } from "@/components/PartyPaymentForm";
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  PageHeader,
  PrintHeader,
  SystemGeneratedNote,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Th,
  cx,
  errMsg,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { amountInWords, date, daysUntil, inr, n, qty, round2 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Purchase, StoreSettings } from "@/lib/types";

export default function PurchaseDetailPage() {
  return (
    <RequirePerm perms={["invoices.view"]}>
      <PurchaseDetail />
    </RequirePerm>
  );
}

function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [payOpen, setPayOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { data: p, error, loading, reload } = useApi<Purchase>(`/purchases/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");

  const due = p && p.status === "COMPLETED" ? Math.max(n(p.totalAmount) - n(p.paidAmount), 0) : 0;
  const fixed = useMemo<FixedParty | null>(
    () =>
      p
        ? {
            partyType: "VENDOR",
            partyId: p.vendorId,
            partyName: p.vendor?.name ?? "vendor",
            balance: p.vendor ? n(p.vendor.balance) : undefined,
            documentId: p.id,
            documentLabel: p.purchaseNo,
            due: Math.max(n(p.totalAmount) - n(p.paidAmount), 0),
          }
        : null,
    [p],
  );

  async function cancelPurchase() {
    if (!p) return;
    const fromGrn = !!p.grnId;
    const ok = await confirm(
      fromGrn
        ? `Cancel invoice ${p.purchaseNo}? Only the bill is reversed: ${inr(p.totalAmount)} is taken off the vendor's payable balance and ${p.grn?.grnNo ?? "the GRN"} becomes free to be booked again with the correct bill. The goods received stay in stock. Payments already made stay on the vendor account as an advance.`
        : `Cancel purchase ${p.purchaseNo}? All ${p.items?.length ?? 0} item(s) on this bill will be removed from stock and ${inr(p.totalAmount)} will be taken off the vendor's payable balance. This fails if any of this stock has already been sold. Payments already made stay on the vendor account as an advance.`,
      { danger: true, confirmLabel: fromGrn ? "Cancel invoice" : "Cancel purchase" },
    );
    if (!ok) return;
    setCancelling(true);
    try {
      await api.del(`/purchases/${p.id}`);
      toast.success(fromGrn ? `Invoice ${p.purchaseNo} cancelled · GRN can be booked again` : `Purchase ${p.purchaseNo} cancelled · stock removed`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCancelling(false);
    }
  }

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !p) return <Spinner page />;
  if (!p) return null;

  const cancelled = p.status === "CANCELLED";
  const items = p.items ?? [];
  const days = due > 0 ? daysUntil(p.dueDate) : null;
  const v = p.vendor;
  // Posted notes are applied to this bill like a payment (capped at what was due), so they sit inside paidAmount
  const byNotes = Math.min(postedNotesTotal(p.debitNotes), n(p.paidAmount));

  return (
    <>
      <div className="no-print mb-2">
        <Link href="/purchases" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Purchase Invoices
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.purchaseNo}
            {cancelled ? <StatusBadge status="CANCELLED" /> : <StatusBadge status={p.paymentStatus} />}
          </span>
        }
        subtitle={`${v?.name ?? "Vendor"} · ${date(p.purchaseDate)}${p.user ? ` · entered by ${p.user.name}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {!cancelled && due > 0 && can("payments.vendor") && (
              <Button icon={<Banknote className="size-4" />} onClick={() => setPayOpen(true)}>
                Record Payment
              </Button>
            )}
            {!cancelled && can("purchases.cancel") && (
              <Button variant="danger" icon={<Ban className="size-4" />} onClick={cancelPurchase} loading={cancelling}>
                {p.grnId ? "Cancel Invoice" : "Cancel Purchase"}
              </Button>
            )}
          </>
        }
      />

      {cancelled && (
        <div className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600">
          {p.po
            ? "This invoice was cancelled and no longer counts toward the vendor's balance. If it was booked from goods inward, the GRN is open to be invoiced again."
            : "This purchase was cancelled. Its stock was reversed and it no longer counts toward the vendor's balance."}
        </div>
      )}

      {!cancelled && p.rateMismatch && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Invoice rate differs from the purchase order — check with the vendor.
        </div>
      )}

      {p.grn && (
        <p className="no-print mb-4 text-sm text-slate-600">
          Received via{" "}
          <Link href={`/goods-inward/${p.grn.id}`} className="font-medium text-brand-700 hover:underline">
            {p.grn.grnNo}
          </Link>
          {p.po && (
            <>
              {" "}
              against{" "}
              <Link href={`/purchase-orders/${p.po.id}`} className="font-medium text-brand-700 hover:underline">
                {p.po.poNo}
              </Link>
            </>
          )}
        </p>
      )}

      <Card className="print-area mb-4" bodyClassName="p-0">
        <div className="hidden px-4 pt-3 print:block">
          <PrintHeader store={store} title="Purchase Bill" number={p.purchaseNo} status={cancelled ? { label: "Cancelled", tone: "red" } : null} />
        </div>

        {/* Vendor, billing and delivery addresses */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</p>
            {v ? (
              <>
                {can("vendors.view") ? (
                  <Link href={`/vendors/${v.id}`} className="mt-1 block break-words font-semibold text-slate-900 hover:text-brand-700">
                    {v.name}
                  </Link>
                ) : (
                  <p className="mt-1 break-words font-semibold text-slate-900">{v.name}</p>
                )}
                <p className="text-sm text-slate-600">{[v.address, v.city, v.state, v.pincode].filter(Boolean).join(", ") || "No address on file"}</p>
                <p className="text-sm text-slate-600">{[v.phone, v.gstin && `GSTIN ${v.gstin}`].filter(Boolean).join(" · ")}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">—</p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Billed To</p>
            <p className="mt-1 font-semibold text-slate-900">{store?.storeName ?? "—"}</p>
            <p className="text-sm text-slate-600">{[store?.address, store?.city, store?.state, store?.pincode].filter(Boolean).join(", ") || "—"}</p>
            {store?.gstin && <p className="text-sm text-slate-600">GSTIN {store.gstin}</p>}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Delivered To</p>
            <p className="mt-1 font-semibold text-slate-900">{p.branch ? `${p.branch.name} (${p.branch.code})` : store?.storeName ?? "—"}</p>
            <p className="text-sm text-slate-600">{[p.branch?.address, p.branch?.city].filter(Boolean).join(", ") || "—"}</p>
          </div>
        </div>

        <div className="border-b border-slate-100 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-slate-500">Bill no.</dt>
            <dd className="font-medium text-slate-900">{p.purchaseNo}</dd>
            <dt className="text-slate-500">Vendor invoice</dt>
            <dd className="font-medium text-slate-900">{p.vendorInvoiceNo || "—"}</dd>
            <dt className="text-slate-500">Bill date</dt>
            <dd>{date(p.purchaseDate)}</dd>
            <dt className="text-slate-500">Due date</dt>
            <dd>
              {date(p.dueDate)}
              {days !== null && days < 0 && (
                <span className="no-print ml-1.5">
                  <Badge tone="red">{-days}d overdue</Badge>
                </span>
              )}
            </dd>
            {p.grn && (
              <>
                <dt className="text-slate-500">Goods received</dt>
                <dd>
                  <Link href={`/goods-inward/${p.grn.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.grn.grnNo}
                  </Link>
                </dd>
              </>
            )}
            {p.po && (
              <>
                <dt className="text-slate-500">Purchase order</dt>
                <dd>
                  <Link href={`/purchase-orders/${p.po.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.po.poNo}
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Product</Th>
              <Th>Batch</Th>
              <Th>Mfg</Th>
              <Th>Expiry</Th>
              <Th right>Qty</Th>
              <Th right>Free</Th>
              <Th right>Rate</Th>
              <Th right>Disc</Th>
              <Th right>GST</Th>
              <Th right>Taxable</Th>
              <Th right>Tax</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const exp = daysUntil(it.expiryDate);
              return (
                <tr key={it.id}>
                  <Td className="text-slate-400">{i + 1}</Td>
                  {/* Keeps the name readable when the table scrolls sideways on phones; no effect on paper */}
                  <Td className="min-w-40 print:min-w-0">
                    <p className="font-medium text-slate-900">{it.product?.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {it.product?.sku}
                      {it.product?.hsnCode && ` · HSN ${it.product.hsnCode}`}
                    </p>
                  </Td>
                  <Td className="font-mono text-xs">{it.batchNo || "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{date(it.mfgDate)}</Td>
                  <Td className={cx("whitespace-nowrap text-xs", exp !== null && exp < 0 ? "text-red-600" : exp !== null && exp <= 90 ? "text-amber-700" : "")}>
                    {date(it.expiryDate)}
                  </Td>
                  <Td right>
                    {qty(it.quantity)} <span className="text-xs text-slate-500">{it.product?.unit}</span>
                  </Td>
                  <Td right className="text-slate-500">
                    {n(it.freeQty) ? qty(it.freeQty) : "—"}
                  </Td>
                  <Td right>{inr(it.rate)}</Td>
                  <Td right className="text-slate-500">
                    {n(it.discountPct) ? `${n(it.discountPct)}%` : "—"}
                  </Td>
                  <Td right className="text-slate-500">
                    {n(it.gstRate)}%
                  </Td>
                  <Td right>{inr(it.taxableAmount)}</Td>
                  <Td right className="text-slate-500">
                    {inr(it.taxAmount)}
                  </Td>
                  <Td right className="font-medium text-slate-900">
                    {inr(it.amount)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div className="text-sm">
            <p className="text-xs text-slate-500">Amount in words</p>
            <p className="mt-0.5 font-medium text-slate-800">{amountInWords(n(p.totalAmount))}</p>
            {p.notes && (
              <>
                <p className="mt-3 text-xs text-slate-500">Notes</p>
                <p className="mt-0.5 whitespace-pre-line text-slate-700">{p.notes}</p>
              </>
            )}
          </div>
          <dl className="space-y-1.5 text-sm sm:ml-auto sm:w-72">
            <Row label="Taxable Value" value={inr(p.subtotal)} />
            <Row label="GST" value={inr(p.taxAmount)} />
            {n(p.discount) > 0 && <Row label="Discount" value={`− ${inr(p.discount)}`} />}
            {n(p.otherCharges) > 0 && <Row label="Freight / Other Charges" value={inr(p.otherCharges)} />}
            {n(p.roundOff) !== 0 && <Row label="Round Off" value={`${n(p.roundOff) > 0 ? "+" : "−"}${inr(Math.abs(n(p.roundOff)))}`} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="num">{inr(p.totalAmount)}</dd>
            </div>
            <Row label="Paid" value={inr(round2(n(p.paidAmount) - byNotes))} />
            {byNotes > 0 && <Row label="Settled by Notes" value={inr(byNotes)} />}
            {!cancelled && (
              <div className={cx("flex justify-between font-semibold", due > 0 ? "text-amber-700" : "text-brand-700")}>
                <dt>Balance due</dt>
                <dd className="num">{inr(due)}</dd>
              </div>
            )}
          </dl>
        </div>
        <SystemGeneratedNote className="hidden px-4 pb-4 pt-2 print:block" />
      </Card>

      <Card title="Payments Against This Bill" bodyClassName="p-0" className="no-print">
        <Table>
          <thead>
            <tr>
              <Th>Payment No.</Th>
              <Th>Date</Th>
              <Th>Mode</Th>
              <Th>Reference</Th>
              <Th className="hidden md:table-cell">Notes</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {!p.payments?.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                  No payments linked to this bill
                  {n(p.paidAmount) > byNotes && " — it was settled from an on-account vendor payment"}
                  {byNotes > 0 && n(p.paidAmount) <= byNotes && " — it was settled by debit/credit notes"}
                </td>
              </tr>
            ) : (
              p.payments.map((pay) => (
                <tr key={pay.id}>
                  <Td className="whitespace-nowrap font-medium text-slate-900">{pay.paymentNo}</Td>
                  <Td className="whitespace-nowrap">{date(pay.paymentDate)}</Td>
                  <Td>{modeLabel(pay.mode)}</Td>
                  <Td className="text-slate-500">{pay.reference || "—"}</Td>
                  <Td className="hidden text-xs text-slate-500 md:table-cell">{pay.notes || ""}</Td>
                  <Td right className="font-medium">
                    {inr(pay.amount)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {v && (
        <NotesPanel
          className="mt-4"
          notes={p.debitNotes}
          allowNew={!cancelled}
          preset={{
            vendor: { id: v.id, name: v.name },
            purchase: { id: p.id, purchaseNo: p.purchaseNo, vendorInvoiceNo: p.vendorInvoiceNo },
            po: p.po ?? undefined,
            grn: p.grn ?? undefined,
          }}
          onChanged={() => void reload()}
        />
      )}

      <PartyPaymentForm
        open={payOpen}
        fixed={fixed}
        onClose={() => setPayOpen(false)}
        onSaved={() => {
          setPayOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-800">{value}</dd>
    </div>
  );
}

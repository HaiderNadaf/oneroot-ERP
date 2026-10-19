"use client";

import { ArrowLeft, FileText, Printer, ReceiptText, Tag } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, Table, Td, Th, cx } from "@/components/ui";
import { date, dateTime, inr, n, qty, round2 } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import type { DebitNote, Grn, GrnItem, Paged, StoreSettings, Vendor } from "@/lib/types";
import { LazyLabelPrintModal } from "@/components/lazy";
import { GrnNotesModal } from "@/components/GrnNotesModal";
import { NoteStatusBadge, NoteTypeBadge } from "@/components/NoteForm";

type GrnDetail = Grn & { vendor: Vendor; items: GrnItem[] };

export default function GrnDetailPage() {
  return (
    <RequirePerm perms={["purchases.view"]}>
      <GrnView />
    </RequirePerm>
  );
}

function GrnView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const canInvoice = can("purchases.manage");
  const { data: g, error, loading, reload } = useApi<GrnDetail>(`/grns/${id}`);
  const { data: store } = useApi<StoreSettings>("/settings");
  const [labelsOpen, setLabelsOpen] = useState(false);
  // Debit & credit notes on this GRN or on the invoice booked from it, shown in a popup
  const notesQ = useApi<Paged<DebitNote>>(`/debit-notes`, { grnId: id, pageSize: 50 });
  const notes = notesQ.data?.items ?? [];
  const [notesOpen, setNotesOpen] = useState<{ focus: string | null } | null>(null);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !g) return <Spinner page />;
  if (!g) return null;

  const items = g.items;
  const sum = (k: "passedQty" | "rejectedQty" | "damagedQty" | "expiredQty") => items.reduce((s, i) => s + n(i[k]), 0);
  const totals = { passed: sum("passedQty"), rejected: sum("rejectedQty"), damaged: sum("damagedQty"), expired: sum("expiredQty") };
  // Everything that arrived, whatever the inspection outcome
  const received = totals.passed + totals.rejected + totals.damaged + totals.expired;
  const receivedOf = (it: (typeof items)[number]) => n(it.passedQty) + n(it.rejectedQty) + n(it.damagedQty) + n(it.expiredQty);
  const passedValue = round2(items.reduce((s, i) => s + n(i.passedQty) * n(i.rate), 0));
  const invoiced = !!g.purchase && g.purchase.status !== "CANCELLED";
  const v = g.vendor;

  return (
    <>
      <div className="no-print mb-2">
        <Link href="/goods-inward" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Goods Inward
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {g.grnNo}
            {invoiced ? <Badge tone="green">Invoiced</Badge> : <Badge tone="amber">Invoice Pending</Badge>}
          </span>
        }
        subtitle={`${v.name} · received ${date(g.receivedAt)}${g.receivedBy ? ` by ${g.receivedBy.name}` : ""}`}
        actions={
          <>
            <Button variant="secondary" icon={<ReceiptText className="size-4" />} onClick={() => setNotesOpen({ focus: null })}>
              Debit &amp; Credit Notes{notes.length ? ` (${notes.length})` : ""}
            </Button>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print
            </Button>
            {totals.passed > 0 && (
              <Button variant="secondary" icon={<Tag className="size-4" />} onClick={() => setLabelsOpen(true)}>
                Batch Labels
              </Button>
            )}
            {!invoiced && totals.passed > 0 && canInvoice && (
              <Button icon={<FileText className="size-4" />} onClick={() => router.push(`/goods-inward/${g.id}/invoice`)}>
                Book Purchase Invoice
              </Button>
            )}
          </>
        }
      />

      <Card className="print-area mb-4" bodyClassName="p-0">
        <div className="hidden border-b border-slate-200 px-4 py-3 text-center print:block">
          <p className="text-lg font-semibold">{store?.storeName ?? "Goods received note"}</p>
          {store && (
            <p className="text-xs text-slate-600">
              {[store.address, store.city, store.state, store.pincode].filter(Boolean).join(", ")}
              {store.gstin && ` · GSTIN ${store.gstin}`}
            </p>
          )}
          <p className="mt-1 text-sm font-medium uppercase tracking-wide">Goods Received Note</p>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-slate-100 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</p>
            {can("vendors.view") ? (
              <Link href={`/vendors/${v.id}`} className="mt-1 block break-words font-semibold text-slate-900 hover:text-brand-700">
                {v.name}
              </Link>
            ) : (
              <p className="mt-1 break-words font-semibold text-slate-900">{v.name}</p>
            )}
            <p className="text-sm text-slate-600">{[v.address, v.city, v.state, v.pincode].filter(Boolean).join(", ")}</p>
            <p className="text-sm text-slate-600">{[v.phone, v.gstin && `GSTIN ${v.gstin}`].filter(Boolean).join(" · ")}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">GRN no.</dt>
            <dd className="font-medium text-slate-900">{g.grnNo}</dd>
            <dt className="text-slate-500">Purchase order</dt>
            <dd>
              <Link href={`/purchase-orders/${g.po.id}`} className="font-medium text-brand-700 hover:underline">
                {g.po.poNo}
              </Link>
            </dd>
            <dt className="text-slate-500">Supplier invoice no.</dt>
            <dd className="font-medium text-slate-900">{g.supplierInvoiceNo || "—"}</dd>
            <dt className="text-slate-500">Received</dt>
            <dd>{dateTime(g.receivedAt)}</dd>
            <dt className="text-slate-500">Total received</dt>
            <dd className="font-semibold text-slate-900">
              {qty(received)} <span className="text-xs font-normal text-slate-500">units · {qty(totals.passed)} passed</span>
            </dd>
            <dt className="text-slate-500">Received by</dt>
            <dd>{g.receivedBy?.name ?? "—"}</dd>
            <dt className="text-slate-500">Vehicle no.</dt>
            <dd>{g.vehicleNo || "—"}</dd>
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
              <Th right>PO Rate</Th>
              <Th right>Received</Th>
              <Th right>Passed</Th>
              <Th right>Rejected</Th>
              <Th right>Damaged</Th>
              <Th right>Expired</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <Td className="text-slate-400">{i + 1}</Td>
                {/* Keeps the name readable when the table scrolls sideways on phones; no effect on paper */}
                <Td className="min-w-40 print:min-w-0">
                  <p className="font-medium text-slate-900">{it.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {it.product.sku}
                    {it.product.hsnCode && ` · HSN ${it.product.hsnCode}`} · ordered {qty(it.poItem.quantity)} {it.product.unit}
                  </p>
                </Td>
                <Td className="font-mono text-xs">{it.batchNo || "—"}</Td>
                <Td className="whitespace-nowrap text-xs">{date(it.mfgDate)}</Td>
                <Td className="whitespace-nowrap text-xs">{date(it.expiryDate)}</Td>
                <Td right>{inr(it.rate)}</Td>
                <Td right className="font-semibold text-slate-900">
                  {qty(receivedOf(it))} <span className="text-xs font-normal text-slate-500">{it.product.unit}</span>
                </Td>
                <Td right className="font-semibold text-brand-700">
                  {qty(it.passedQty)} <span className="text-xs font-normal text-slate-500">{it.product.unit}</span>
                </Td>
                <QtyCell v={it.rejectedQty} tone="text-red-600" />
                <QtyCell v={it.damagedQty} tone="text-amber-700" />
                <QtyCell v={it.expiredQty} tone="text-amber-700" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium">
              <Td colSpan={6} className="text-right text-xs uppercase tracking-wide text-slate-500">
                Total · passed value {inr(passedValue)} excl. GST
              </Td>
              <Td right className="font-semibold text-slate-900">
                {qty(received)}
              </Td>
              <Td right className="font-semibold text-brand-700">
                {qty(totals.passed)}
              </Td>
              <QtyCell v={totals.rejected} tone="text-red-600" />
              <QtyCell v={totals.damaged} tone="text-amber-700" />
              <QtyCell v={totals.expired} tone="text-amber-700" />
            </tr>
          </tfoot>
        </Table>

        <div className="hidden grid-cols-2 gap-8 px-4 pb-4 pt-12 text-center text-xs text-slate-600 print:grid">
          <p className="border-t border-slate-400 pt-1">Received by</p>
          <p className="border-t border-slate-400 pt-1">Checked by</p>
        </div>
      </Card>

      <div className="no-print grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Purchase Invoice">
          {invoiced && g.purchase ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                Booked as{" "}
                <Link href={`/purchases/${g.purchase.id}`} className="font-medium text-brand-700 hover:underline">
                  {g.purchase.purchaseNo}
                </Link>
              </span>
              <Badge tone="green">Invoiced</Badge>
            </div>
          ) : totals.passed > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">The vendor&apos;s bill for the passed goods has not been booked yet.</span>
              {canInvoice && (
                <Button size="sm" icon={<FileText className="size-4" />} onClick={() => router.push(`/goods-inward/${g.id}/invoice`)}>
                  Book Invoice
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nothing passed inspection on this GRN, so there is nothing to invoice.</p>
          )}
        </Card>
        <Card
          title="Debit & Credit Notes"
          actions={
            notes.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setNotesOpen({ focus: null })}>
                View all
              </Button>
            )
          }
        >
          {notes.length ? (
            <ul className="space-y-2 text-sm">
              {notes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setNotesOpen({ focus: d.id })} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                    {d.dnNo} <NoteTypeBadge type={d.noteType} />
                  </button>
                  <span className="flex items-center gap-2">
                    <span className="num text-slate-700">{inr(d.totalAmount)}</span>
                    <NoteStatusBadge status={d.status} type={d.noteType} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cx("text-sm", totals.rejected ? "text-amber-700" : "text-slate-500")}>
              {totals.rejected ? "No debit note linked." : "No goods were rejected on this GRN."}
            </p>
          )}
        </Card>
      </div>

      <GrnNotesModal
        open={!!notesOpen}
        onClose={() => setNotesOpen(null)}
        grnNo={g.grnNo}
        notes={notes}
        loading={notesQ.loading}
        error={notesQ.error}
        onRetry={notesQ.reload}
        focusId={notesOpen?.focus}
      />

      <LazyLabelPrintModal
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        items={items
          .filter((it) => n(it.passedQty) > 0)
          .map((it) => ({
            productId: it.productId,
            name: it.product.name,
            sku: it.product.sku,
            barcode: it.product.barcode,
            packSize: it.product.packSize,
            mrp: it.product.mrp,
            salePrice: it.product.salePrice,
            batchNo: it.batchNo,
            expiryDate: it.expiryDate,
            count: Math.min(Math.ceil(n(it.passedQty)), 200),
          }))}
      />
    </>
  );
}

function QtyCell({ v, tone }: { v: unknown; tone: string }) {
  return (
    <Td right className={n(v) ? cx("font-medium", tone) : "text-slate-400"}>
      {n(v) ? qty(v) : "—"}
    </Td>
  );
}

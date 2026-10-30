"use client";

import { ArrowLeft, FileText, Printer, ReceiptText, Tag } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { RequirePerm } from "@/components/AppShell";
import { PrintPortal } from "@/components/PrintPortal";
import { Attachments } from "@/components/Attachments";
import { Badge, Button, Card, ErrorBox, PageHeader, PrintHeader, Spinner, SystemGeneratedNote, Table, Td, Th, cx } from "@/components/ui";
import { vendorAddresses } from "@/lib/address";
import { branchAddress, branchLabel } from "@/components/VendorBranches";
import { date, dateTime, inr, n, qty, round2 } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { printAs } from "@/lib/print";
import type { DebitNote, Grn, GrnItem, Paged, StoreSettings, Vendor } from "@/lib/types";
import { LazyLabelPrintModal } from "@/components/lazy";
import { GrnNotesModal } from "@/components/GrnNotesModal";
import { NoteStatusBadge, NoteTypeBadge } from "@/components/NoteForm";

type GrnDetail = Grn & { vendor: Vendor; items: GrnItem[] };

export default function GrnDetailPage() {
  return (
    <RequirePerm perms={["grn.view", "purchases.receive"]}>
      <GrnView />
    </RequirePerm>
  );
}

function GrnView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();
  const canInvoice = can("invoices.create");
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
  // A PO line received in several batches has several GRN rows; count its ordered qty once
  const poQty = [...new Map(items.map((it) => [it.poItemId, n(it.poItem.quantity)])).values()].reduce((s, q) => s + q, 0);
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
            <Button
              variant="secondary"
              icon={<Printer className="size-4" />}
              onClick={() => printAs("sheet", "size: A4 portrait; margin: 0 !important;", `Goods Received Note - ${g.grnNo}`)}
            >
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

      {/* Printed on its own from under <body> on A4 portrait, so the wide screen table never gets cut off */}
      <PrintPortal className="sheet-host">
        <GrnPrint g={g} store={store} />
      </PrintPortal>

      <Card className="mb-4 print:hidden" bodyClassName="p-0">

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
            <p className="text-sm text-slate-600">
              <span className="text-slate-500">Billing: </span>
              {vendorAddresses(v).billing || "—"}
            </p>
            <p className="text-sm text-slate-600">
              <span className="text-slate-500">Shipping: </span>
              {vendorAddresses(v).shipping || "—"}
            </p>
            <p className="text-sm text-slate-600">{[v.phone, v.gstin && `GSTIN ${v.gstin}`].filter(Boolean).join(" · ")}</p>
            {g.po.vendorBranch && (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-brand-700">From branch: </span>
                <span className="font-medium text-slate-900">{branchLabel(g.po.vendorBranch)}</span>
                {branchAddress(g.po.vendorBranch) && ` · ${branchAddress(g.po.vendorBranch)}`}
                {g.po.vendorBranch.gstin && ` · GSTIN ${g.po.vendorBranch.gstin}`}
              </p>
            )}
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
              <Th right>PO Qty</Th>
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
                    {it.product.hsnCode && ` · HSN ${it.product.hsnCode}`}
                  </p>
                  <SerialList serials={it.serials} batchNo={it.batchNo} />
                </Td>
                <Td className="font-mono text-xs">{it.batchNo || "—"}</Td>
                <Td className="whitespace-nowrap text-xs">{date(it.mfgDate)}</Td>
                <Td className="whitespace-nowrap text-xs">{date(it.expiryDate)}</Td>
                <Td right>{inr(it.rate)}</Td>
                <Td right className="whitespace-nowrap text-slate-700">
                  {qty(it.poItem.quantity)} <span className="text-xs text-slate-500">{it.product.unit}</span>
                </Td>
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
              <Td right className="text-slate-700">
                {qty(poQty)}
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
      </Card>

      {/* Supplier invoice scan, delivery challan, photos of the goods… */}
      <Attachments type="GRN" entityId={g.id} canManage={can("purchases.receive")} className="no-print mb-4" />

      <div className="no-print grid grid-cols-1 gap-4">
        {/* <Card title="Purchase Invoice">
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
        </Card> */}
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
              {totals.rejected ? "No debit note linked." : "No returns raised on this GRN."}
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
        grn={g}
        canManage={can("notes.create")}
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

/** Serial numbers that came in with a GRN row, under the batch they belong to */
function SerialList({ serials, batchNo, print }: { serials?: GrnItem["serials"]; batchNo?: string | null; print?: boolean }) {
  if (!serials?.length) return null;
  return (
    <p className={cx("mt-1 break-words", print ? "text-[9.5px] text-slate-600" : "text-xs text-slate-600")}>
      <span className="font-medium text-slate-500">
        S/N{batchNo ? ` (batch ${batchNo})` : ""}:{" "}
      </span>
      <span className="font-mono">{serials.map((s) => s.serialNo).join(", ")}</span>
    </p>
  );
}

const PRINT_MARGIN_MM = 12;

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-brand-700">{children}</p>
);

/** A4 portrait print of the GRN (hidden on screen): header, details, vendor / receiving branch, items with batch and serials */
function GrnPrint({ g, store }: { g: GrnDetail; store: StoreSettings | null | undefined }) {
  const v = g.vendor;
  const items = g.items;
  const sum = (k: "passedQty" | "rejectedQty" | "damagedQty" | "expiredQty") => items.reduce((s, i) => s + n(i[k]), 0);
  const totals = { passed: sum("passedQty"), rejected: sum("rejectedQty"), damaged: sum("damagedQty"), expired: sum("expiredQty") };
  const receivedOf = (it: GrnItem) => n(it.passedQty) + n(it.rejectedQty) + n(it.damagedQty) + n(it.expiredQty);
  const received = totals.passed + totals.rejected + totals.damaged + totals.expired;
  const passedValue = round2(items.reduce((s, i) => s + n(i.passedQty) * n(i.rate), 0));
  const invoiced = !!g.purchase && g.purchase.status !== "CANCELLED";
  const details: [string, string][] = [
    ["GRN No.", g.grnNo],
    ["Received On", dateTime(g.receivedAt)],
    ["Purchase Order", g.po.poNo],
    ["Supplier Invoice No.", g.supplierInvoiceNo || "—"],
    ["Received By", g.receivedBy?.name ?? "—"],
    ["Vehicle No.", g.vehicleNo || "—"],
    ["Total Received", `${qty(received)} (${qty(totals.passed)} passed)`],
    ["Purchase Invoice", invoiced && g.purchase ? g.purchase.purchaseNo : "Pending"],
  ];
  const th = "px-2 py-1.5 text-[9.5px] font-semibold uppercase leading-tight tracking-wide";
  const td = "px-2 py-1.5 align-top";
  const qtyTd = (x: unknown, tone?: string) => (
    <td className={cx(td, "num whitespace-nowrap text-right", n(x) ? tone : "text-slate-400")}>{n(x) ? qty(x) : "—"}</td>
  );

  return (
    <div className="paper grn-print hidden text-[11px] leading-[1.45] text-slate-800 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block">
      {/* The empty header / footer rows repeat on every printed page: the same top and bottom margin on all pages */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td style={{ height: `${PRINT_MARGIN_MM}mm` }} />
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td style={{ height: `${PRINT_MARGIN_MM}mm` }} />
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td style={{ paddingLeft: `${PRINT_MARGIN_MM}mm`, paddingRight: `${PRINT_MARGIN_MM}mm` }}>
              <PrintHeader store={store} title="Goods Received Note" number={g.grnNo} />

              {/* ── Details: four to a row ── */}
              <section className="mt-4">
                <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50/70">
                  {details.map(([label, value], i) => (
                    <div key={label} className={cx("min-w-0 px-2.5 py-1.5", i % 4 !== 0 && "border-l border-slate-200", i >= 4 && "border-t border-slate-200")}>
                      <Label>{label}</Label>
                      <p className="mt-0.5 break-words font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Vendor and the branch the goods came into ── */}
              <section className="mt-3 grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-md border border-slate-200 border-t-[3px] border-t-brand-600 px-3 py-2">
                  <Label>Vendor</Label>
                  <p className="mt-1 text-[12px] font-bold text-slate-900">{v.name}</p>
                  {vendorAddresses(v).billing && <p className="text-[10px] text-slate-600">Billing: {vendorAddresses(v).billing}</p>}
                  {vendorAddresses(v).shipping && <p className="text-[10px] text-slate-600">Shipping: {vendorAddresses(v).shipping}</p>}
                  <p className="text-[10px] text-slate-600">{[v.phone, v.gstin && `GSTIN: ${v.gstin}`].filter(Boolean).join(" · ")}</p>
                  {g.po.vendorBranch && (
                    <p className="mt-1 text-[10px] text-slate-700">
                      <span className="font-semibold">From branch: {branchLabel(g.po.vendorBranch)}</span>
                      {branchAddress(g.po.vendorBranch) && ` · ${branchAddress(g.po.vendorBranch)}`}
                      {g.po.vendorBranch.gstin && ` · GSTIN: ${g.po.vendorBranch.gstin}`}
                    </p>
                  )}
                </div>
                <div className="min-w-0 rounded-md border border-slate-200 border-t-[3px] border-t-brand-600 px-3 py-2">
                  <Label>Received At</Label>
                  <p className="mt-1 text-[12px] font-bold text-slate-900">{g.branch ? `${g.branch.name} (${g.branch.code})` : (store?.storeName ?? "—")}</p>
                  <p className="text-[10px] text-slate-600">{[g.branch?.address, g.branch?.city].filter(Boolean).join(", ")}</p>
                </div>
              </section>

              {/* ── Items: batch, dates and serials stacked so ten columns fit the portrait width ── */}
              <section className="mt-4">
                <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-900">Items ({items.length})</h2>
                <table className="w-full table-fixed border-collapse text-[10.5px]">
                  <colgroup>
                    <col className="w-[6mm]" />
                    <col />
                    <col className="w-[30mm]" />
                    <col className="w-[17mm]" />
                    <col className="w-[14mm]" />
                    <col className="w-[14mm]" />
                    <col className="w-[14mm]" />
                    <col className="w-[13mm]" />
                    <col className="w-[13mm]" />
                    <col className="w-[13mm]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-forest-800 text-left text-white">
                      <th className={th}>#</th>
                      <th className={th}>Product</th>
                      <th className={th}>Batch · Mfg · Expiry</th>
                      <th className={cx(th, "text-right")}>PO Rate</th>
                      <th className={cx(th, "text-right")}>PO Qty</th>
                      <th className={cx(th, "text-right")}>Recd.</th>
                      <th className={cx(th, "text-right")}>Passed</th>
                      <th className={cx(th, "text-right")}>Rej.</th>
                      <th className={cx(th, "text-right")}>Dmg.</th>
                      <th className={cx(th, "text-right")}>Expd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id} className={cx("break-inside-avoid border-b border-slate-200", i % 2 === 1 && "bg-slate-50")}>
                        <td className={cx(td, "text-slate-400")}>{i + 1}</td>
                        <td className={cx(td, "break-words")}>
                          <p className="font-semibold text-slate-900">{it.product.name}</p>
                          <p className="text-[9.5px] text-slate-500">
                            SKU {it.product.sku}
                            {it.product.hsnCode && ` · HSN ${it.product.hsnCode}`}
                            {it.product.packSize && ` · ${it.product.packSize}`}
                          </p>
                          <SerialList serials={it.serials} batchNo={it.batchNo} print />
                        </td>
                        <td className={cx(td, "break-words")}>
                          <p className="font-mono text-[10px] font-medium text-slate-900">{it.batchNo || "—"}</p>
                          <p className="text-[9.5px] text-slate-500">Mfg {date(it.mfgDate)}</p>
                          <p className="text-[9.5px] text-slate-500">Exp {date(it.expiryDate)}</p>
                        </td>
                        <td className={cx(td, "num text-right")}>{inr(it.rate)}</td>
                        <td className={cx(td, "num text-right")}>
                          {qty(it.poItem.quantity)} <span className="text-[9px] text-slate-500">{it.product.unit}</span>
                        </td>
                        {qtyTd(receivedOf(it), "font-semibold text-slate-900")}
                        {qtyTd(it.passedQty, "font-semibold text-brand-700")}
                        {qtyTd(it.rejectedQty, "text-red-600")}
                        {qtyTd(it.damagedQty, "text-amber-700")}
                        {qtyTd(it.expiredQty, "text-amber-700")}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-b-2 border-slate-300 font-semibold">
                      <td colSpan={5} className={cx(td, "text-right text-slate-600")}>
                        Total · passed value {inr(passedValue)} excl. GST
                      </td>
                      {qtyTd(received, "text-slate-900")}
                      {qtyTd(totals.passed, "text-brand-700")}
                      {qtyTd(totals.rejected, "text-red-600")}
                      {qtyTd(totals.damaged, "text-amber-700")}
                      {qtyTd(totals.expired, "text-amber-700")}
                    </tr>
                  </tfoot>
                </table>
              </section>

              {g.notes && (
                <section className="mt-3 break-inside-avoid">
                  <Label>Notes</Label>
                  <p className="mt-0.5 whitespace-pre-line text-slate-700">{g.notes}</p>
                </section>
              )}

              <SystemGeneratedNote doc="goods received note" className="mt-5 break-inside-avoid" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function QtyCell({ v, tone }: { v: unknown; tone: string }) {
  return (
    <Td right className={n(v) ? cx("font-medium", tone) : "text-slate-400"}>
      {n(v) ? qty(v) : "—"}
    </Td>
  );
}

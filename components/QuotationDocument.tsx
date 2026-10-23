"use client";

import { amountInWords, date, inr, n, qty, round2 } from "@/lib/format";
import { stateCodeOf } from "@/lib/gst";
import type { Quotation, StoreSettings } from "@/lib/types";
import { PrintHeader, SystemGeneratedNote } from "./ui";

/** A quote past its valid-until date (and still open) */
export const isExpired = (q: Pick<Quotation, "status" | "validUntil">) =>
  q.status === "OPEN" && !!q.validUntil && new Date(q.validUntil).setHours(23, 59, 59, 999) < Date.now();

/** Printable quotation, laid out like the GST tax invoice. Render inside a `.print-area` container. */
export function QuotationDocument({ quotation: q, settings }: { quotation: Quotation; settings: StoreSettings | null }) {
  const items = q.items ?? [];
  const total = n(q.totalAmount);
  const cancelled = q.status === "CANCELLED";
  const expired = isExpired(q);
  const licences = [
    settings?.fertilizerLicenseNo && `Fert. Lic: ${settings.fertilizerLicenseNo}`,
    settings?.pesticideLicenseNo && `Pest. Lic: ${settings.pesticideLicenseNo}`,
    settings?.seedLicenseNo && `Seed Lic: ${settings.seedLicenseNo}`,
  ].filter(Boolean);
  const address = [q.customerAddress, q.customerCity, q.customerState, q.customerPincode].filter(Boolean).join(", ");
  const grossBeforeDiscount = items.reduce((s, i) => s + n(i.quantity) * n(i.rate), 0);

  const business = q.partyType === "BUSINESS";
  const code = business ? stateCodeOf({ gstin: q.customerGstin, state: q.customerState }) : undefined;

  // GST summary by HSN (and rate, should one HSN carry two): CGST and SGST are each half the tax, at half the rate
  const byHsn = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  for (const i of items) {
    const key = `${i.hsnCode || "—"}|${n(i.gstRate)}`;
    const cur = byHsn.get(key) ?? { hsn: i.hsnCode || "—", rate: n(i.gstRate), taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + n(i.taxableAmount));
    cur.tax = round2(cur.tax + n(i.taxAmount));
    byHsn.set(key, cur);
  }
  const hsnRows = [...byHsn.values()]
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
    .map((r) => ({ ...r, cgst: round2(r.tax / 2), sgst: round2(r.tax - round2(r.tax / 2)), total: round2(r.taxable + r.tax) }));
  const hsnTotal = hsnRows.reduce(
    (t, r) => ({
      taxable: round2(t.taxable + r.taxable),
      cgst: round2(t.cgst + r.cgst),
      sgst: round2(t.sgst + r.sgst),
      tax: round2(t.tax + r.tax),
      total: round2(t.total + r.total),
    }),
    { taxable: 0, cgst: 0, sgst: 0, tax: 0, total: 0 },
  );
  const pct = (x: number) => `${round2(x)}%`;

  const status = cancelled
    ? { label: "Cancelled", tone: "red" as const }
    : q.status === "REJECTED"
      ? { label: "Rejected", tone: "red" as const }
      : expired
        ? { label: "Expired", tone: "amber" as const }
        : null;

  return (
    <div className="relative bg-surface text-[13px] leading-snug text-slate-900">
      {cancelled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-[25deg] select-none border-8 border-red-500/30 px-8 py-2 text-7xl font-black tracking-widest text-red-500/25">
            CANCELLED
          </span>
        </div>
      )}

      <PrintHeader
        store={settings}
        title="Quotation"
        number={q.quotationNo}
        status={status}
        details={
          <>
            {(settings?.phone || settings?.email) && (
              <p className="text-[10.5px] text-slate-500">
                {[settings?.phone && `Ph: ${settings.phone}`, settings?.email].filter(Boolean).join(" · ")}
              </p>
            )}
            {licences.length > 0 && <p className="text-[10.5px] text-slate-500">{licences.join(" · ")}</p>}
          </>
        }
      />

      {/* Quoted-to and quotation meta */}
      <div className="grid grid-cols-2 gap-4 border-b border-slate-300 py-3">
        {business ? (
          // A business: the firm's registered details, as on a B2B tax invoice
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Quotation For (Business)</p>
            <p className="font-semibold">{q.customerName}</p>
            {q.customerGstin && <p className="text-xs font-semibold">GSTIN: {q.customerGstin}</p>}
            {/* PAN is characters 3–12 of a GSTIN */}
            {q.customerGstin?.length === 15 && <p className="text-xs">PAN: {q.customerGstin.slice(2, 12)}</p>}
            {address && <p className="text-xs">{address}</p>}
            {q.customerState && (
              <p className="text-xs">
                State: {q.customerState}
                {code ? ` (Code ${code})` : ""} · Place of supply: {q.customerState}
              </p>
            )}
            {q.contactPerson && <p className="text-xs">Attn: {q.contactPerson}</p>}
            {(q.customerPhone || q.customerEmail) && (
              <p className="text-xs">{[q.customerPhone && `Ph: ${q.customerPhone}`, q.customerEmail].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        ) : (
          // A customer: just who the quote is for
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Quotation For</p>
            <p className="font-semibold">{q.customerName}</p>
            {q.customerPhone && <p className="text-xs">Ph: {q.customerPhone}</p>}
            {address && <p className="text-xs">{address}</p>}
          </div>
        )}
        <div className="text-right">
          <p>
            <span className="text-slate-500">Quotation no: </span>
            <span className="font-semibold">{q.quotationNo}</span>
          </p>
          <p>
            <span className="text-slate-500">Date: </span>
            {date(q.quotationDate)}
          </p>
          {q.validUntil && (
            <p>
              <span className="text-slate-500">Valid until: </span>
              {date(q.validUntil)}
            </p>
          )}
          <p>
            <span className="text-slate-500">Supply: </span>
            {q.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}
          </p>
        </div>
      </div>

      {/* Items */}
      <table className="mt-3 w-full border-collapse border-b border-slate-800 text-[12px]">
        <thead>
          <tr className="border-y border-slate-800 text-left text-[11px] uppercase">
            <th className="py-1.5 pr-1">Sl</th>
            <th className="py-1.5 pr-1">Product</th>
            <th className="py-1.5 pr-1">HSN</th>
            <th className="py-1.5 pr-1 text-right">Qty</th>
            <th className="py-1.5 pr-1 text-right">Rate</th>
            <th className="py-1.5 pr-1 text-right">Disc%</th>
            <th className="py-1.5 pr-1 text-right">Taxable</th>
            <th className="py-1.5 pr-1 text-right">GST%</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={i.id} className="border-b border-slate-200 align-top">
              <td className="py-1.5 pr-1">{idx + 1}</td>
              <td className="py-1.5 pr-1">
                <p className="font-medium">{i.productName}</p>
                {(i.product?.technicalName || i.product?.packSize) && (
                  <p className="text-[11px] text-slate-500">{[i.product?.technicalName, i.product?.packSize].filter(Boolean).join(" · ")}</p>
                )}
              </td>
              <td className="py-1.5 pr-1">{i.hsnCode || "—"}</td>
              <td className="num py-1.5 pr-1 text-right whitespace-nowrap">
                {qty(i.quantity)} {i.unit}
              </td>
              <td className="num py-1.5 pr-1 text-right">{inr(i.rate)}</td>
              <td className="num py-1.5 pr-1 text-right">{n(i.discountPct) ? n(i.discountPct).toFixed(2) : "—"}</td>
              <td className="num py-1.5 pr-1 text-right">{inr(i.taxableAmount)}</td>
              <td className="num py-1.5 pr-1 text-right">{n(i.gstRate)}%</td>
              <td className="num py-1.5 text-right font-medium">{inr(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Second table: GST by HSN code — HSN · Taxable · CGST/IGST % · amount · SGST % · amount · Total (taxable + tax) */}
      <div className="mt-4">
        <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">GST Summary</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-slate-400 text-right uppercase text-slate-500">
                <th className="py-1 pr-2 text-left">HSN Code</th>
                <th className="py-1 pr-2">Taxable</th>
                {q.isInterState ? (
                  <>
                    <th className="py-1 pr-2">IGST %</th>
                    <th className="py-1 pr-2">IGST Amt</th>
                  </>
                ) : (
                  <>
                    <th className="py-1 pr-2">CGST %</th>
                    <th className="py-1 pr-2">CGST Amt</th>
                    <th className="py-1 pr-2">SGST %</th>
                    <th className="py-1 pr-2">SGST Amt</th>
                  </>
                )}
                <th className="py-1">Total Amt</th>
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((r) => (
                <tr key={`${r.hsn}|${r.rate}`} className="border-b border-slate-100 text-right">
                  <td className="py-1 pr-2 text-left">{r.hsn}</td>
                  <td className="num py-1 pr-2">{inr(r.taxable)}</td>
                  {q.isInterState ? (
                    <>
                      <td className="num py-1 pr-2">{pct(r.rate)}</td>
                      <td className="num py-1 pr-2">{inr(r.tax)}</td>
                    </>
                  ) : (
                    <>
                      <td className="num py-1 pr-2">{pct(r.rate / 2)}</td>
                      <td className="num py-1 pr-2">{inr(r.cgst)}</td>
                      <td className="num py-1 pr-2">{pct(r.rate / 2)}</td>
                      <td className="num py-1 pr-2">{inr(r.sgst)}</td>
                    </>
                  )}
                  <td className="num py-1">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-400 text-right font-semibold">
                <td className="py-1 pr-2 text-left">Total</td>
                <td className="num py-1 pr-2">{inr(hsnTotal.taxable)}</td>
                {q.isInterState ? (
                  <>
                    <td />
                    <td className="num py-1 pr-2">{inr(hsnTotal.tax)}</td>
                  </>
                ) : (
                  <>
                    <td />
                    <td className="num py-1 pr-2">{inr(hsnTotal.cgst)}</td>
                    <td />
                    <td className="num py-1 pr-2">{inr(hsnTotal.sgst)}</td>
                  </>
                )}
                <td className="num py-1">{inr(hsnTotal.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Amount in words and notes on the left, the bill totals on the right */}
      <div className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-300 pt-3 sm:grid-cols-[1fr_240px] print:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <p className="text-xs">
            <span className="text-slate-500">Amount in words: </span>
            <span className="font-semibold">{amountInWords(total)}</span>
          </p>
          {q.notes && (
            <p className="mt-1 text-xs">
              <span className="text-slate-500">Notes: </span>
              {q.notes}
            </p>
          )}
        </div>

        <dl className="space-y-1 text-[12px]">
          <Row label="Gross (Incl. GST)" value={inr(grossBeforeDiscount)} />
          {n(q.discount) > 0 && <Row label="Discount" value={`− ${inr(q.discount)}`} />}
          <Row label="Taxable Value" value={inr(q.subtotal)} />
          {q.isInterState ? (
            <Row label="IGST" value={inr(q.igst)} />
          ) : (
            <>
              <Row label="CGST" value={inr(q.cgst)} />
              <Row label="SGST" value={inr(q.sgst)} />
            </>
          )}
          {n(q.roundOff) !== 0 && <Row label="Round Off" value={`${n(q.roundOff) > 0 ? "+" : "−"} ${inr(Math.abs(n(q.roundOff)))}`} />}
          <div className="flex justify-between border-y-2 border-slate-800 py-1.5 text-base font-bold">
            <dt>Quoted Total</dt>
            <dd className="num">{inr(total)}</dd>
          </div>
        </dl>
      </div>

      {q.terms && (
        <div className="mt-4 text-xs">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Terms &amp; Conditions</p>
          <p className="mt-0.5 whitespace-pre-line">{q.terms}</p>
        </div>
      )}

      <footer className="mt-8 border-t border-slate-300 pt-3 text-[11px] text-slate-600">
        <p>
          This is a quotation, not a tax invoice. Prices and stock are subject to availability
          {q.validUntil ? ` and are valid until ${date(q.validUntil)}` : ""}.
        </p>
        <SystemGeneratedNote doc="quotation" className="mt-2.5" />
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

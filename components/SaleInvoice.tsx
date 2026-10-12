"use client";

import { amountInWords, date, inr, n, qty } from "@/lib/format";
import type { Sale, StoreSettings } from "@/lib/types";
import { modeLabel } from "@/lib/types";

/** Printable GST tax invoice. Render inside a `.print-area` container. */
export function SaleInvoice({ sale, settings }: { sale: Sale; settings: StoreSettings | null }) {
  const items = sale.items ?? [];
  const total = n(sale.totalAmount);
  const paid = n(sale.paidAmount);
  const balance = Math.max(0, total - paid);
  const cancelled = sale.status === "CANCELLED";
  const c = sale.customer;
  const storeAddress = [settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(", ");
  const licences = [
    settings?.fertilizerLicenseNo && `Fert. Lic: ${settings.fertilizerLicenseNo}`,
    settings?.pesticideLicenseNo && `Pest. Lic: ${settings.pesticideLicenseNo}`,
    settings?.seedLicenseNo && `Seed Lic: ${settings.seedLicenseNo}`,
  ].filter(Boolean);
  const billAddress = c ? [c.village, c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ") : "";
  const totalQty = items.reduce((s, i) => s + n(i.quantity), 0);
  const grossBeforeDiscount = items.reduce((s, i) => s + n(i.quantity) * n(i.rate), 0);

  // Tax summary grouped by GST rate
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const i of items) {
    const r = n(i.gstRate);
    const cur = byRate.get(r) ?? { taxable: 0, tax: 0 };
    cur.taxable += n(i.taxableAmount);
    cur.tax += n(i.taxAmount);
    byRate.set(r, cur);
  }
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="relative bg-white text-[13px] leading-snug text-slate-900">
      {cancelled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-[25deg] select-none border-8 border-red-500/30 px-8 py-2 text-7xl font-black tracking-widest text-red-500/25">
            CANCELLED
          </span>
        </div>
      )}

      {/* Store header */}
      <header className="border-b-2 border-slate-800 pb-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tax Invoice</p>
        <h2 className="mt-1 text-2xl font-bold">{settings?.storeName ?? "—"}</h2>
        {storeAddress && <p className="text-xs text-slate-600">{storeAddress}</p>}
        <p className="text-xs text-slate-600">
          {[settings?.phone && `Ph: ${settings.phone}`, settings?.email].filter(Boolean).join(" · ")}
        </p>
        {settings?.gstin && (
          <p className="mt-0.5 text-xs font-semibold">
            GSTIN: {settings.gstin}
            {settings.stateCode ? ` · State code: ${settings.stateCode}` : ""}
          </p>
        )}
        {licences.length > 0 && <p className="mt-0.5 text-[11px] text-slate-600">{licences.join(" · ")}</p>}
      </header>

      {/* Bill-to and invoice meta */}
      <div className="grid grid-cols-2 gap-4 border-b border-slate-300 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Bill to</p>
          <p className="font-semibold">{c?.name ?? sale.customerName ?? "Cash customer"}</p>
          {(c?.phone ?? sale.customerPhone) && <p className="text-xs">Ph: {c?.phone ?? sale.customerPhone}</p>}
          {billAddress && <p className="text-xs">{billAddress}</p>}
          {c?.gstin && <p className="text-xs font-medium">GSTIN: {c.gstin}</p>}
        </div>
        <div className="text-right">
          <p>
            <span className="text-slate-500">Invoice no: </span>
            <span className="font-semibold">{sale.invoiceNo}</span>
          </p>
          <p>
            <span className="text-slate-500">Date: </span>
            {date(sale.saleDate)}
          </p>
          {sale.dueDate && (
            <p>
              <span className="text-slate-500">Due date: </span>
              {date(sale.dueDate)}
            </p>
          )}
          <p>
            <span className="text-slate-500">Supply: </span>
            {sale.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}
          </p>
          <p>
            <span className="text-slate-500">Payment: </span>
            {sale.payments && sale.payments.length > 1 ? sale.payments.map((p) => `${modeLabel(p.mode)} ${inr(p.amount)}`).join(" + ") : modeLabel(sale.paymentMode)}
          </p>
          {sale.govtReceiptNo && (
            <p>
              <span className="text-slate-500">Govt POS receipt: </span>
              <span className="font-semibold">{sale.govtReceiptNo}</span>
              {sale.aadhaarVerified ? " · Aadhaar verified" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Items */}
      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-slate-800 text-left text-[11px] uppercase">
            <th className="py-1.5 pr-1">Sl</th>
            <th className="py-1.5 pr-1">Product</th>
            <th className="py-1.5 pr-1">HSN</th>
            <th className="py-1.5 pr-1">Batch</th>
            <th className="py-1.5 pr-1">Expiry</th>
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
                  <p className="text-[11px] text-slate-500">
                    {[i.product?.technicalName, i.product?.packSize].filter(Boolean).join(" · ")}
                  </p>
                )}
                {i.isFree ? (
                  <p className="text-[11px] text-slate-500">Free under scheme{i.scheme ? ` · ${i.scheme.name}` : ""}</p>
                ) : (
                  i.scheme && <p className="text-[11px] text-slate-500">Scheme · {i.scheme.name}</p>
                )}
                {n(i.returnedQty) > 0 && <p className="text-[11px] text-amber-700">Returned: {qty(i.returnedQty)}</p>}
              </td>
              <td className="py-1.5 pr-1">{i.hsnCode || "—"}</td>
              <td className="py-1.5 pr-1">{i.batchNo || "—"}</td>
              <td className="py-1.5 pr-1 whitespace-nowrap">{i.expiryDate ? date(i.expiryDate) : "—"}</td>
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
        <tfoot>
          <tr className="border-b border-slate-800 font-semibold">
            <td className="py-1.5" colSpan={5}>
              Total ({items.length} item{items.length === 1 ? "" : "s"})
            </td>
            <td className="num py-1.5 pr-1 text-right">{qty(totalQty)}</td>
            <td colSpan={2} />
            <td className="num py-1.5 pr-1 text-right">{inr(sale.subtotal)}</td>
            <td />
            <td className="num py-1.5 text-right">{inr(items.reduce((s, i) => s + n(i.amount), 0))}</td>
          </tr>
        </tfoot>
      </table>

      {/* Tax summary + totals */}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_260px] print:grid-cols-[1fr_260px]">
        <div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-400 text-left uppercase text-slate-500">
                <th className="py-1">GST %</th>
                <th className="py-1 text-right">Taxable</th>
                {sale.isInterState ? (
                  <th className="py-1 text-right">IGST</th>
                ) : (
                  <>
                    <th className="py-1 text-right">CGST</th>
                    <th className="py-1 text-right">SGST</th>
                  </>
                )}
                <th className="py-1 text-right">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {rates.map(([r, v]) => (
                <tr key={r} className="border-b border-slate-100">
                  <td className="py-1">{r}%</td>
                  <td className="num py-1 text-right">{inr(v.taxable)}</td>
                  {sale.isInterState ? (
                    <td className="num py-1 text-right">{inr(v.tax)}</td>
                  ) : (
                    <>
                      <td className="num py-1 text-right">{inr(v.tax / 2)}</td>
                      <td className="num py-1 text-right">{inr(v.tax / 2)}</td>
                    </>
                  )}
                  <td className="num py-1 text-right">{inr(v.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs">
            <span className="text-slate-500">Amount in words: </span>
            <span className="font-semibold">{amountInWords(total)}</span>
          </p>
          {sale.notes && (
            <p className="mt-1 text-xs">
              <span className="text-slate-500">Notes: </span>
              {sale.notes}
            </p>
          )}
        </div>

        <dl className="space-y-1 text-[12px]">
          <Row label="Gross (incl. GST)" value={inr(grossBeforeDiscount)} />
          {n(sale.discount) > 0 && <Row label="Discount" value={`− ${inr(sale.discount)}`} />}
          <Row label="Taxable value" value={inr(sale.subtotal)} />
          {sale.isInterState ? (
            <Row label="IGST" value={inr(sale.igst)} />
          ) : (
            <>
              <Row label="CGST" value={inr(sale.cgst)} />
              <Row label="SGST" value={inr(sale.sgst)} />
            </>
          )}
          {n(sale.roundOff) !== 0 && <Row label="Round off" value={`${n(sale.roundOff) > 0 ? "+" : "−"} ${inr(Math.abs(n(sale.roundOff)))}`} />}
          <div className="flex justify-between border-y-2 border-slate-800 py-1.5 text-base font-bold">
            <dt>Grand total</dt>
            <dd className="num">{inr(total)}</dd>
          </div>
          {!cancelled && (
            <>
              <Row label="Paid" value={inr(paid)} />
              <Row label="Balance due" value={inr(balance)} strong={balance > 0} />
            </>
          )}
        </dl>
      </div>

      {/* Footer */}
      <footer className="mt-8 grid grid-cols-2 items-end gap-4 border-t border-slate-300 pt-3 text-[11px] text-slate-600">
        <div>
          {settings?.invoiceFooter && <p className="whitespace-pre-line">{settings.invoiceFooter}</p>}
          <p className="mt-1">Goods once sold will be taken back only as per store policy. Subject to local jurisdiction.</p>
          <p className="mt-6">Customer signature</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-slate-800">For {settings?.storeName ?? "the store"}</p>
          <div className="mt-10 border-t border-slate-400 pt-1">Authorised signatory</div>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd className={strong ? "num font-semibold text-red-700" : "num"}>{value}</dd>
    </div>
  );
}

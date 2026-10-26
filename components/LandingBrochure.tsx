"use client";

import { CheckCircle2, Download } from "lucide-react";
import { printAs } from "@/lib/print";
import { CONTACT } from "@/lib/contact";
import { PrintPortal } from "./PrintPortal";
import { PrintLogo } from "./ui";

const BROCHURE: { title: string; points: string[] }[] = [
  {
    title: "Who it is for",
    points: [
      "Agri-input retailers: seeds, fertilisers, pesticides and farm equipment",
      "Dealers and distributors with several branches or warehouses",
      "FPOs and stores that sell on credit to farmers and run village vans",
    ],
  },
  {
    title: "What is inside",
    points: [
      "Counter POS with GST tax invoices, quotations and an offline mode",
      "Batch and expiry-wise stock, serial numbers, transfers and adjustments",
      "Purchase orders with approvals, goods inward (GRN) and auto-booked bills",
      "Debit / credit notes, vendor and customer ledgers, payments and dues",
      "Van sales, schemes, customer-type discounts and govt fertiliser match",
    ],
  },
  {
    title: "Why stores choose it",
    points: [
      "One flow from order to invoice: no double entry, stock and books agree",
      "CGST / SGST or IGST worked out from the GSTIN and place of supply",
      "Role-based rights, discount limits, manager PINs and a full audit trail",
      "Trial balance, P&L, balance sheet, GST registers and a Tally export",
    ],
  },
  {
    title: "Getting started",
    points: [
      "Cloud-hosted: open it in any browser on a PC, tablet or phone",
      "Import your product list from Excel; opening stock and balances carried in",
      "Thermal (58 / 80 mm) and A4 printing, barcode labels and scanners",
      "Onboarding and training for your counter and accounts staff",
    ],
  },
];

const FACTS: [string, string][] = [
  ["12+", "modules in one system"],
  ["3", "print layouts: A4, 80 mm, 58 mm"],
  ["24×7", "cloud access from any device"],
];

function BrochureBody() {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {FACTS.map(([value, label]) => (
          <div key={label} className="rounded-lg bg-brand-50 px-2 py-3 text-center sm:px-3">
            <p className="font-display text-xl font-bold text-brand-700 sm:text-2xl">{value}</p>
            <p className="text-[11px] leading-snug text-muted sm:text-xs">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
        {BROCHURE.map((b) => (
          <div key={b.title}>
            <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-slate-900">{b.title}</h3>
            <ul className="mt-2 space-y-1.5">
              {b.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

/** The brochure on the landing page, with a button that saves it as a one-page A4 PDF */
export function LandingBrochure() {
  return (
    <>
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Product brochure</p>
            <h3 className="mt-1 font-display text-xl font-bold text-slate-900 sm:text-2xl">OneRoot ERP for agri-input stores</h3>
            <p className="mt-1 text-sm text-muted">Billing, stock, purchasing and accounts in one system.</p>
          </div>
          <button
            type="button"
            onClick={() => printAs("sheet", "size: A4; margin: 0;", "OneRoot-ERP-Brochure")}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:w-auto"
          >
            <Download className="size-4" />
            Download Brochure (PDF)
          </button>
        </div>
        <div className="mt-6">
          <BrochureBody />
        </div>
      </div>

      {/* Print-only copy: "sheet" printing shows just this portal (see lib/print.ts and globals.css) */}
      <PrintPortal className="sheet-host">
        <div className="hidden bg-white p-[12mm] text-slate-900 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block">
          <div className="flex items-center justify-between border-b-[3px] border-forest-700 pb-3">
            <PrintLogo className="mx-0" imageClassName="h-12 w-auto" textClassName="text-[30px]" />
            <div className="text-right">
              <p className="text-[19px] font-extrabold uppercase tracking-[0.06em] text-brand-800">Product Brochure</p>
              <p className="text-xs text-slate-500">OneRoot ERP for agri-input stores</p>
            </div>
          </div>
          <div className="mt-6">
            <BrochureBody />
          </div>
          <div className="mt-8 border-t border-slate-300 pt-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">ENP Farms Private Limited (OneRoot)</p>
            <p>
              {CONTACT.email} · {CONTACT.phone} · www.oneroot.farm
            </p>
            <p>{CONTACT.address}</p>
          </div>
        </div>
      </PrintPortal>
    </>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { printAs, printPdf } from "@/lib/print";
import { LOGOS } from "@/lib/logos";
import { CONTACT } from "@/lib/contact";
import { PrintPortal } from "./PrintPortal";
import { PrintLogo, cx } from "./ui";

/** The OneRoot ERP brochure, drawn on the page and printed as a one-page A4 sheet */
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

type BrandBrochure = {
  id: string;
  brand: string;
  title: string;
  text: string;
  /** Pages and file size, shown under the title */
  meta: string;
  /** A PDF in /public; without one the brochure is the ERP sheet printed from this page */
  pdf?: string;
  /** Cover image (page 1 of the PDF) */
  cover?: string;
};

const BRAND_BROCHURES: BrandBrochure[] = [
  // Hidden for now; uncomment to show the OneRoot ERP brochure card again (its print sheet below is kept)
  // {
  //   id: "oneroot",
  //   brand: "OneRoot ERP",
  //   title: "Product brochure",
  //   text: "Billing, stock, purchasing and accounts for agri-input stores, on one page.",
  //   meta: "1 page · A4",
  // },
  {
    id: "balwaan",
    brand: "Balwaan Krishi",
    title: "Product catalogue 2026-27",
    text: "Power weeders, tillers and the rest of the Balwaan farm machinery range.",
    meta: "20 pages · 15 MB",
    pdf: "/brochures/balwaan-catalogue.pdf",
    cover: "/brochures/balwaan-cover.jpg",
  },
  {
    id: "lemken",
    brand: "LEMKEN India",
    title: "Corporate brochure",
    text: "LEMKEN's ploughs, cultivators and seed drills for next-level farming.",
    meta: "26 pages · 77 MB",
    pdf: "/brochures/lemken-india-brochure.pdf",
    cover: "/brochures/lemken-cover.jpg",
  },
];

function BrandCard({ b }: { b: BrandBrochure }) {
  const [loading, setLoading] = useState(false);
  const download = () => {
    if (!b.pdf) return printAs("sheet", "size: A4; margin: 0;", "OneRoot-ERP-Brochure");
    setLoading(true);
    printPdf(b.pdf, () => setLoading(false));
  };
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="relative aspect-[3/4] overflow-hidden border-b border-line bg-brand-50">
        {b.cover ? (
          <Image src={b.cover} alt={`${b.brand} ${b.title} cover`} fill sizes="(min-width: 640px) 320px, 100vw" className="object-cover object-top" />
        ) : (
          // The ERP brochure has no PDF: a cover drawn from the logo
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <Image src={LOGOS.vertical.src} alt="OneRoot" width={LOGOS.vertical.width} height={LOGOS.vertical.height} className="h-20 w-auto" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Product brochure</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900">ERP for agri-input stores</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">{b.brand}</p>
        <h3 className="mt-1 font-display text-lg font-bold text-slate-900">{b.title}</h3>
        <p className="mt-1 flex-1 text-sm text-muted">{b.text}</p>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <FileText className="size-3.5" />
          {b.meta}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={download}
            disabled={loading}
            className={cx(
              "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700",
              loading && "cursor-wait opacity-80",
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {loading ? "Preparing…" : "Download"}
          </button>
          {b.pdf && (
            <a
              href={b.pdf}
              target="_blank"
              rel="noopener"
              aria-label={`View ${b.brand} ${b.title}`}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-3 text-slate-700 hover:bg-brand-50"
            >
              <ExternalLink className="size-4" />
              {"View"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Brand brochures on the landing page: Download opens the system print dialog, where it can be printed or saved as PDF */
export function LandingBrochure() {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mx-auto lg:max-w-3xl">
        {BRAND_BROCHURES.map((b) => (
          <BrandCard key={b.id} b={b} />
        ))}
      </div>

      {/* Print-only copy of the ERP brochure: "sheet" printing shows just this portal (see lib/print.ts and globals.css) */}
      <PrintPortal className="sheet-host">
        <div className="hidden bg-white p-[12mm] text-slate-900 [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block">
          <div className="flex items-center justify-between border-b-[3px] border-forest-700 pb-3">
            <PrintLogo className="mx-0" imageClassName="h-14 w-auto" />
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

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { GstReportView, ProfitLossReport } from "@/components/reports/FinancialReports";
import { DayBookReport, OutstandingReport, StockValuationReport } from "@/components/reports/LedgerReports";
import { PurchaseByMonthReport, PurchaseByProductReport, PurchaseByVendorReport } from "@/components/reports/PurchaseReports";
import { ProductSalesReport, PurchaseRegisterReport, SalesRegisterReport } from "@/components/reports/RegisterReports";
import { RangeBar, defaultRange, type Range } from "@/components/reports/ReportKit";
import { PageHeader, Tabs, cx } from "@/components/ui";

/** Each report sits under one group tab; the first of a group is what opening the group shows */
const TABS = [
  { value: "pl", label: "Profit & Loss", group: "finance" },
  { value: "gst", label: "GST Summary", group: "finance" },
  { value: "outstanding", label: "Outstanding", group: "finance" },
  { value: "daybook", label: "Day Book", group: "finance" },
  { value: "sales", label: "Sales Register", group: "sales" },
  { value: "products", label: "Product-Wise Sales", group: "sales" },
  { value: "po-product", label: "By Product", group: "po" },
  { value: "po-vendor", label: "By Vendor", group: "po" },
  { value: "po-month", label: "By Month", group: "po" },
  { value: "grn-product", label: "By Product", group: "grn" },
  { value: "grn-vendor", label: "By Vendor", group: "grn" },
  { value: "grn-month", label: "By Month", group: "grn" },
  // Purchase invoices are booked from goods received
  { value: "purchases", label: "Purchase Register", group: "grn" },
  { value: "stock", label: "Stock Valuation", group: "stock" },
] as const;

const GROUPS = [
  { value: "finance", label: "Finance" },
  { value: "sales", label: "Sales" },
  { value: "po", label: "PO" },
  { value: "grn", label: "GRN" },
  { value: "stock", label: "Stock" },
] as const;

type Tab = (typeof TABS)[number]["value"];
type Group = (typeof GROUPS)[number]["value"];

export default function ReportsPage() {
  return (
    <RequirePerm perms={["reports.view"]}>
      <Reports />
    </RequirePerm>
  );
}

function Reports() {
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: Tab = TABS.some((t) => t.value === fromUrl) ? (fromUrl as Tab) : "pl";
  const group: Group = TABS.find((t) => t.value === tab)!.group;
  const inGroup = TABS.filter((t) => t.group === group);
  const [range, setRange] = useState<Range>(defaultRange);

  // Keep the tab in the URL so a report can be bookmarked or reopened after printing
  const setTab = (t: Tab) => router.replace(`/reports?tab=${t}`, { scroll: false });
  const rangeBar = <RangeBar value={range} onChange={setRange} />;

  return (
    <>
      <PageHeader title="Reports" subtitle="Profit, GST, registers, purchase orders, goods received, stock and outstanding — print or export any report" />
      <Tabs<Group> tabs={[...GROUPS]} value={group} onChange={(g) => setTab(TABS.find((t) => t.group === g)!.value)} />
      {/* The reports inside the open group (none to pick when it has only one) */}
      {inGroup.length > 1 && (
        <div className="no-print no-scrollbar -mt-1 mb-4 flex gap-2 overflow-x-auto">
          {inGroup.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cx(
                "whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                tab === t.value ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "pl" && <ProfitLossReport range={range} rangeBar={rangeBar} />}
      {tab === "gst" && <GstReportView range={range} rangeBar={rangeBar} />}
      {tab === "sales" && <SalesRegisterReport range={range} rangeBar={rangeBar} />}
      {tab === "purchases" && <PurchaseRegisterReport range={range} rangeBar={rangeBar} />}
      {tab === "po-product" && <PurchaseByProductReport kind="po" range={range} rangeBar={rangeBar} />}
      {tab === "po-vendor" && <PurchaseByVendorReport kind="po" range={range} rangeBar={rangeBar} />}
      {tab === "po-month" && <PurchaseByMonthReport kind="po" />}
      {tab === "grn-product" && <PurchaseByProductReport kind="grn" range={range} rangeBar={rangeBar} />}
      {tab === "grn-vendor" && <PurchaseByVendorReport kind="grn" range={range} rangeBar={rangeBar} />}
      {tab === "grn-month" && <PurchaseByMonthReport kind="grn" />}
      {tab === "products" && <ProductSalesReport range={range} rangeBar={rangeBar} />}
      {tab === "stock" && <StockValuationReport />}
      {tab === "outstanding" && <OutstandingReport />}
      {tab === "daybook" && <DayBookReport />}
    </>
  );
}
